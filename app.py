import os
import io
import json
import base64
import logging
import tempfile
from concurrent.futures import ThreadPoolExecutor

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
from groq import Groq
from openai import OpenAI
import pdfplumber
from pdf2image import convert_from_path
from PIL import Image

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app, origins=["*"])

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Initialize Groq Client
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# Initialize NVIDIA NIM Client (fallback)
nvidia_client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.environ.get("NVIDIA_API_KEY")
)

# Models
VISION_MODEL = "llama-3.2-11b-vision-preview" 
TEXT_MODEL = "llama-3.3-70b-versatile"
NVIDIA_TEXT_MODEL = "meta/llama-3.3-70b-instruct"

def llm_chat(messages, temperature=0.3):
    """Try Groq first, fall back to NVIDIA NIM on rate-limit or error."""
    try:
        resp = groq_client.chat.completions.create(
            model=TEXT_MODEL, messages=messages, temperature=temperature
        )
        return resp.choices[0].message.content
    except Exception as e:
        logging.warning(f"Groq failed ({e}), falling back to NVIDIA NIM...")
        try:
            resp = nvidia_client.chat.completions.create(
                model=NVIDIA_TEXT_MODEL, messages=messages, temperature=temperature, max_tokens=4096
            )
            return resp.choices[0].message.content
        except Exception as e2:
            logging.error(f"NVIDIA NIM also failed: {e2}")
            raise e2


def encode_image(image):
    buffered = io.BytesIO()
    image.save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

def extract_text_from_pdf_vision(pdf_path):
    """
    Convert PDF pages to images and use Llama 3.2 Vision to extract text.
    Falls back to normal PDF extraction if Poppler is not installed.
    """
    try:
        logging.info("Attempting Vision-based extraction...")
        images = convert_from_path(pdf_path)
        extracted_text = ""

        def process_page(image):
            base64_image = encode_image(image)
            response = groq_client.chat.completions.create(
                model=VISION_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract all text from this page content verbatim. Preserve layout where possible."},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
                        ],
                    }
                ],
                temperature=0.1,
            )
            return response.choices[0].message.content

        # Parallelize page processing
        with ThreadPoolExecutor() as executor:
            results = list(executor.map(process_page, images))
        
        extracted_text = "\n\n".join(results)
        logging.info("Vision extraction successful.")
        return extracted_text

    except Exception as e:
        logging.warning(f"Vision extraction failed (likely Poppler missing): {e}")
        logging.info("Falling back to standard pdfplumber extraction.")
        return extract_text_from_pdf_standard(pdf_path)

def extract_text_from_pdf_standard(pdf_path):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text += (page.extract_text() or "") + "\n\n"
    return text.strip()

def generate_summary(text):
    return llm_chat([
        {"role": "system", "content": "You are an expert summarizer. Summarize the following text into structured, easy-to-read paragraphs. Keep it comprehensive but concise."},
        {"role": "user", "content": text[:20000]}
    ], temperature=0.3)

def generate_quiz_json(text, num_questions=5, difficulty="Medium"):
    prompt = f"""
    Generate {num_questions} multiple-choice questions based on the text below.
    Difficulty Level: {difficulty}.
    
    Return ONLY a raw JSON array. Do not wrap in markdown code blocks.
    Format:
    [
        {{
            "id": 1,
            "question": "Question text here?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "correct_answer": "Option A",
            "explanation": "Brief explanation of why Option A is correct and why others might be wrong."
        }},
        ...
    ]

    Text:
    {text[:15000]}
    """
    
    try:
        content = llm_chat([
            {"role": "system", "content": "You are a quiz generator. Return ONLY valid JSON."},
            {"role": "user", "content": prompt}
        ], temperature=0.5)
        # Clean potential markdown
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        logging.error(f"Quiz generation failed: {e}")
        return []

def generate_explanation(question, user_answer, correct_answer, context_text=""):
    prompt = f"""
    The user answered a question incorrectly.
    Question: {question}
    User Answer: {user_answer}
    Correct Answer: {correct_answer}
    
    Explain WHY the user is wrong and the correct answer is right. Use a helpful, encouraging teacher persona.
    Limit to 3 sentences.
    """
    
    return llm_chat([
        {"role": "system", "content": "You are an AI Tutor."},
        {"role": "user", "content": prompt}
    ])

@app.route("/")
def index():
    return jsonify({"status": "ok", "message": "QuizCraft API is running"})

@app.route("/api/upload", methods=["POST"])
def upload_pdf():
    if "pdf" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    
    file = request.files["pdf"]
    num_questions = int(request.form.get("num_questions", 5))
    difficulty = request.form.get("difficulty", "Medium")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp:
        file.save(temp.name)
        temp_path = temp.name
        
    try:
        # 1. Extract Text
        text = extract_text_from_pdf_vision(temp_path)
        
        # 2. Parallel Generation (Quiz, Flashcards, Notes, Summary)
        with ThreadPoolExecutor() as executor:
            future_summary = executor.submit(generate_summary, text)
            future_quiz = executor.submit(generate_quiz_json, text, num_questions, difficulty)
            future_flashcards = executor.submit(generate_flashcards_json, text)
            future_notes = executor.submit(generate_study_notes_json, text)
            
            # Safely retrieve results with error handling
            try:
                summary = future_summary.result(timeout=60)
            except Exception as e:
                logging.error(f"Summary generation failed: {e}")
                summary = "Summary unavailable due to an error."

            try:
                quiz_data = future_quiz.result(timeout=60)
            except Exception as e:
                logging.error(f"Quiz generation failed: {e}")
                quiz_data = []
            
            try:
                flashcards = future_flashcards.result(timeout=60)
            except Exception as e:
                logging.error(f"Flashcard generation failed: {e}")
                flashcards = []

            try:
                notes = future_notes.result(timeout=60)
            except Exception as e:
                logging.error(f"Notes generation failed: {e}")
                notes = {}
        
        return jsonify({
            "summary": summary,
            "quiz": quiz_data,
            "flashcards": flashcards,
            "notes": notes,
            "source_text": text[:25000] # Increased context for chat
        })
        
    except Exception as e:
        logging.error(f"Processing error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.route("/api/explain", methods=["POST"])
def explain_answer():
    data = request.json
    return jsonify({"explanation": "Explanation now pre-generated in quiz data."})

@app.route("/api/chat", methods=["POST"])
def chat_with_pdf():
    data = request.json
    message = data.get("question") or data.get("message", "")
    context = data.get("context", "")
    
    prompt = f"""
    Context from PDF:
    {context[:20000]}
    
    User Question: {message}
    
    Answer the question based strictly on the context above. Keep it concise and helpful.
    """
    
    try:
        reply = llm_chat([
            {"role": "system", "content": "You are a helpful study assistant."},
            {"role": "user", "content": prompt}
        ], temperature=0.3)
        return jsonify({"answer": reply})
    except Exception as e:
        logging.error(f"Chat error: {e}")
        return jsonify({"answer": "Sorry, I could not process that question right now."})

# --- Helper Functions for New Features ---

def generate_flashcards_json(text):
    prompt = f"""
    Generate 10 key flashcards from the text.
    Return ONLY raw JSON. format:
    [
        {{"term": "Mitochondria", "definition": "Powerhouse of the cell..."}},
        ...
    ]
    
    Text: {text[:15000]}
    """
    try:
        content = llm_chat([{"role": "user", "content": prompt}], temperature=0.3)
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except: return []

def generate_study_notes_json(text):
    prompt = f"""
    Create a structured cheat sheet from the text.
    Return ONLY raw JSON. format:
    {{
        "key_concepts": ["Concept 1", "Concept 2"],
        "formulas": ["E=mc^2", "a^2+b^2=c^2"],
        "dates_events": ["1945: WWII End"]
    }}
    
    Text: {text[:15000]}
    """
    try:
        content = llm_chat([{"role": "user", "content": prompt}], temperature=0.3)
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except: return {"key_concepts": [], "formulas": [], "dates_events": []}

if __name__ == "__main__":
    app.run(debug=True, port=5000)
