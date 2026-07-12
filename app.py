import os
import re
import json
import logging
import requests
import sqlite3
import datetime
from flask import Flask, request, jsonify, send_from_directory, session
from dotenv import load_dotenv
from youtube_transcript_api import YouTubeTranscriptApi
import google.generativeai as genai
from werkzeug.security import generate_password_hash, check_password_hash

def fetch_video_details(video_id):
    """
    Fetches the video title, channel name, and channel URL using YouTube's oEmbed endpoint.
    Returns (title, channel_name, channel_url) or (None, None, None) on failure.
    """
    try:
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            return data.get('title'), data.get('author_name'), data.get('author_url')
    except Exception as e:
        logging.warning(f"Failed to fetch video details via oEmbed for {video_id}: {str(e)}")
    return None, None, None

# Load environment variables
load_dotenv()

# Workaround for Google authentication cert client warning/error
os.environ["GOOGLE_API_USE_CLIENT_CERTIFICATE"] = "false"

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, static_folder='static', static_url_path='')
app.secret_key = os.getenv("SECRET_KEY", "scribetube-default-secret-key-12345")

# Database setup
def get_db_connection():
    db_name = 'test_database.db' if app.config.get('TESTING') else 'database.db'
    conn = sqlite3.connect(db_name)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        # Create users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Create summaries table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                video_id TEXT NOT NULL,
                video_url TEXT NOT NULL,
                title TEXT NOT NULL,
                channel_name TEXT,
                channel_url TEXT,
                summary TEXT NOT NULL,
                key_insights TEXT NOT NULL,
                takeaway TEXT NOT NULL,
                visual_elements TEXT,
                timestamp TEXT NOT NULL,
                is_favorite INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
                UNIQUE(user_id, video_id)
            )
        ''')
        conn.commit()
        logging.info("Database initialized successfully.")
    except Exception as e:
        logging.error(f"Failed to initialize database: {str(e)}")
    finally:
        conn.close()

# Initialize DB on load
init_db()

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    logging.info("Gemini API configured successfully.")
else:
    logging.warning("GEMINI_API_KEY not found in environment. Please add it to your .env file.")

def clean_json_string(raw_text):
    """
    Cleans potentially malformed JSON output from LLM models,
    handling trailing curly braces, markdown blocks, and leading/trailing trash.
    """
    text = raw_text.strip()
    
    # Strip markdown formatting
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    
    # Try finding the first '{' and last '}'
    first_brace = text.find('{')
    last_brace = text.rfind('}')
    
    if first_brace != -1 and last_brace != -1:
        candidate = text[first_brace:last_brace+1]
        
        # Fast path
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass
            
        # Slow path: trace braces from left to find first balanced match
        brace_count = 0
        in_string = False
        escape = False
        
        for idx, char in enumerate(candidate):
            if char == '"' and not escape:
                in_string = not in_string
            elif char == '\\' and in_string:
                escape = not escape
                continue
            elif not in_string:
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        balanced = candidate[:idx+1]
                        try:
                            json.loads(balanced)
                            return balanced
                        except json.JSONDecodeError:
                            pass
            escape = False
            
    return text

def extract_video_id(url):
    """
    Extracts the 11-character YouTube video ID from various YouTube URL formats.
    """
    if not url:
        return None
    
    # If the URL is exactly an 11-char alphanumeric/underscore/dash string, it's already the ID
    if len(url) == 11 and re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
        
    # Standard formats:
    # - https://www.youtube.com/watch?v=VIDEO_ID
    # - https://youtu.be/VIDEO_ID
    # - https://www.youtube.com/embed/VIDEO_ID
    # - https://youtube.com/live/VIDEO_ID
    # - https://m.youtube.com/watch?v=VIDEO_ID
    pattern = r'(?:https?:\/\/)?(?:www\.)?(?:m\.)?(?:music\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|live)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})'
    match = re.search(pattern, url)
    if match:
        return match.group(1)
    return None

def fetch_youtube_transcript(video_id):
    """
    Fetches the transcript text for the given video ID.
    Supports english and falls back to other available languages.
    """
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        
        # Try to find english transcript (manually created or auto-generated)
        try:
            transcript_obj = transcript_list.find_transcript(['en'])
        except Exception:
            # Fallback to the first available transcript in any language
            transcript_obj = next(iter(transcript_list))
            
        fetched = transcript_obj.fetch()
        
        # Join all snippet text contents
        transcript_text = " ".join([snippet.text for snippet in fetched.snippets])
        return transcript_text, None
        
    except Exception as e:
        error_name = type(e).__name__
        logging.error(f"Error fetching transcript for {video_id}: {error_name} - {str(e)}")
        
        # User friendly error messages based on exception type
        if "TranscriptsDisabled" in error_name or "Subtitles are disabled" in str(e):
            return None, "Subtitles/transcripts are disabled or unavailable for this video."
        elif "VideoUnavailable" in error_name:
            return None, "This YouTube video is unavailable, private, or restricted."
        elif "InvalidVideoId" in error_name:
            return None, "The YouTube video ID extracted from the URL is invalid."
        elif "IpBlocked" in error_name or "Too Many Requests" in str(e) or "RequestBlocked" in error_name:
            return None, "YouTube transcript retrieval was rate-limited or blocked. Please try again later."
        else:
            return None, f"Failed to retrieve video transcript. (Error: {error_name})"

@app.route('/')
def serve_index():
    return app.send_static_file('index.html')

@app.route('/api/config-check', methods=['GET'])
def config_check():
    """
    Checks if the Gemini API Key is configured.
    """
    return jsonify({
        "configured": os.getenv("GEMINI_API_KEY") is not None and os.getenv("GEMINI_API_KEY") != ""
    })

@app.route('/api/summarize', methods=['POST'])
def summarize_video():
    # Double check API Key
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return jsonify({
            "error": "GEMINI_API_KEY is missing. Please configure it in your .env file.",
            "code": "MISSING_API_KEY"
        }), 500

    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({"error": "YouTube URL is required."}), 400
        
    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL. Please make sure it contains a valid video ID."}), 400
        
    logging.info(f"Processing summarization request for video ID: {video_id}")
    
    # Fetch video details via oEmbed
    title, channel_name, channel_url = fetch_video_details(video_id)
    
    # 1. Fetch transcript
    transcript_text, err = fetch_youtube_transcript(video_id)
    if err:
        return jsonify({"error": err}), 400
        
    if not transcript_text or len(transcript_text.strip()) < 50:
        return jsonify({"error": "The transcript is too short to generate a meaningful summary."}), 400

    # 2. Call Gemini for structured AI summarization
    try:
        # Re-ensure SDK config (handles hot-reloading env vars if changed)
        genai.configure(api_key=api_key)
        
        prompt = f"""You are an elite YouTube video summarization assistant.
Analyze the provided video transcript and generate a structured summary.
Your response MUST be in raw JSON format matching this schema:
{{
  "summary": "A detailed summary of the video, structured in 2 to 3 cohesive paragraphs. Explain the overall context, the main topics, and the developer's/speaker's core thesis.",
  "key_points": [
    "A concise, high-impact key point or lesson with a bold header. Format it like: '**Heading**: Description of the point and its relevance.'",
    "Include 5 to 8 of these key points."
  ],
  "takeaway": "A powerful 1-2 sentence concluding statement summarizing the ultimate value or final takeaway from the video.",
  "visual_elements": {{
    "type": "timeline | process | comparison | key_metrics",
    "title": "A custom title describing the diagram (e.g. 'Setup Steps' or 'Milestones')",
    "headers": ["Optional Column Header 1", "Optional Column Header 2", "Optional Column Header 3"],
    "data": [
      {{
        "col1": "For type 'timeline': timestamp (e.g., '1:23') or phase. For 'process': step number (e.g., 'Step 1'). For 'comparison': feature category. For 'key_metrics': short metric label or statistical value.",
        "col2": "For type 'timeline': event name. For 'process': action title. For 'comparison': value/spec for item A. For 'key_metrics': description of the statistic.",
        "col3": "For type 'timeline': detailed event description. For 'process': step details. For 'comparison': value/spec for item B. For 'key_metrics': context or source."
      }}
    ]
  }}
}}

Analyze the content and select a visual representation mode (`type`) that best describes the video's concepts:
- Use 'timeline' if the content is chronological, recounts a history, or has distinct timestamped events.
- Use 'process' if the video is a tutorial, how-to, setup guide, flowchart steps, or workflow instructions.
- Use 'comparison' if the video compares tools, alternatives, frameworks, pros vs cons, or concepts.
- Use 'key_metrics' if the video contains data statistics, numerical results, research insights, or scores.

Provide 3 to 6 items in the "data" array.
Respond ONLY with the JSON document. Do not include markdown code block formatting (e.g. ```json ... ```).

Transcript text:
{transcript_text}
"""
        
        # Try a sequence of model names until one succeeds
        model_names = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
        response = None
        last_err = None
        
        for m_name in model_names:
            try:
                logging.info(f"Attempting to generate summary using model: {m_name}")
                model = genai.GenerativeModel(m_name)
                response = model.generate_content(
                    prompt,
                    generation_config={"response_mime_type": "application/json"}
                )
                logging.info(f"Successfully generated summary using model: {m_name}")
                break
            except Exception as e:
                logging.warning(f"Model {m_name} failed: {str(e)}")
                last_err = e
                continue
                
        if response is None:
            raise last_err if last_err else Exception("No models were available for content generation.")
        
        # Parse JSON output from Gemini
        response_text = clean_json_string(response.text)
        
        summary_json = json.loads(response_text)
        
        # Add video details metadata to JSON response
        summary_json["videoId"] = video_id
        summary_json["videoUrl"] = f"https://www.youtube.com/watch?v={video_id}"
        summary_json["title"] = title or f"YouTube Video Summary (ID: {video_id})"
        summary_json["channelName"] = channel_name
        summary_json["channelUrl"] = channel_url
        
        logging.info("Summary generated successfully.")

        # Save to database if user is logged in
        if 'user_id' in session:
            conn = get_db_connection()
            try:
                cursor = conn.cursor()
                timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")
                cursor.execute('''
                    INSERT INTO summaries 
                    (user_id, video_id, video_url, title, channel_name, channel_url, summary, key_insights, takeaway, visual_elements, timestamp, is_favorite)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(user_id, video_id) DO UPDATE SET
                        summary = excluded.summary,
                        key_insights = excluded.key_insights,
                        takeaway = excluded.takeaway,
                        visual_elements = excluded.visual_elements,
                        timestamp = excluded.timestamp
                ''', (
                    session['user_id'],
                    video_id,
                    summary_json["videoUrl"],
                    summary_json["title"],
                    summary_json["channelName"],
                    summary_json["channelUrl"],
                    summary_json["summary"],
                    json.dumps(summary_json.get("key_points", [])),
                    summary_json["takeaway"],
                    json.dumps(summary_json.get("visual_elements")) if summary_json.get("visual_elements") else None,
                    timestamp
                ))
                conn.commit()
                summary_json["timestamp"] = timestamp
            except Exception as e:
                logging.error(f"Error saving generated summary to db: {str(e)}")
            finally:
                conn.close()

        return jsonify(summary_json)
        
    except json.JSONDecodeError as je:
        logging.error(f"Failed to parse Gemini response as JSON: {str(je)}. Raw output: {response.text}")
        return jsonify({"error": "Failed to generate structured summary. The AI model output was malformed. Please try again."}), 500
    except Exception as ge:
        logging.error(f"Gemini API error: {str(ge)}")
        return jsonify({"error": f"AI Summarization failed: {str(ge)}"}), 500

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    if 'user_id' in session:
        return jsonify({
            "logged_in": True,
            "username": session.get('username'),
            "user_id": session.get('user_id')
        })
    return jsonify({"logged_in": False})

@app.route('/api/auth/signup', methods=['POST'])
def auth_signup():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400
        
    if len(username) < 3:
        return jsonify({"error": "Username must be at least 3 characters long."}), 400
        
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters long."}), 400
        
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return jsonify({"error": "Username can only contain letters, numbers, and underscores."}), 400

    conn = get_db_connection()
    try:
        password_hash = generate_password_hash(password)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            (username, password_hash)
        )
        conn.commit()
        
        # Get user details to log them in automatically
        cursor.execute('SELECT id, username FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        
        session['user_id'] = user['id']
        session['username'] = user['username']
        
        return jsonify({
            "success": True,
            "message": "User registered successfully.",
            "username": user['username']
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username is already taken."}), 400
    except Exception as e:
        logging.error(f"Signup error: {str(e)}")
        return jsonify({"error": "An error occurred during registration. Please try again."}), 500
    finally:
        conn.close()

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        user = cursor.fetchone()
        
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            return jsonify({
                "success": True,
                "message": "Logged in successfully.",
                "username": user['username']
            })
        else:
            return jsonify({"error": "Invalid username or password."}), 401
    except Exception as e:
        logging.error(f"Login error: {str(e)}")
        return jsonify({"error": "An error occurred during login."}), 500
    finally:
        conn.close()

@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    session.pop('user_id', None)
    session.pop('username', None)
    return jsonify({"success": True, "message": "Logged out successfully."})

@app.route('/api/user/history', methods=['GET'])
def user_history():
    if 'user_id' not in session:
        return jsonify({"error": "Authentication required."}), 401
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT * FROM summaries WHERE user_id = ? ORDER BY timestamp DESC',
            (session['user_id'],)
        )
        rows = cursor.fetchall()
        
        history = []
        for row in rows:
            try:
                key_insights = json.loads(row['key_insights'])
            except Exception:
                key_insights = []
            
            visual_elements = None
            if row['visual_elements']:
                try:
                    visual_elements = json.loads(row['visual_elements'])
                except Exception:
                    pass
                    
            history.append({
                "videoId": row['video_id'],
                "videoUrl": row['video_url'],
                "title": row['title'],
                "channelName": row['channel_name'],
                "channelUrl": row['channel_url'],
                "summary": row['summary'],
                "key_points": key_insights,
                "takeaway": row['takeaway'],
                "visual_elements": visual_elements,
                "timestamp": row['timestamp'],
                "is_favorite": bool(row['is_favorite'])
            })
        return jsonify(history)
    except Exception as e:
        logging.error(f"Failed to fetch user history: {str(e)}")
        return jsonify({"error": "Failed to retrieve history."}), 500
    finally:
        conn.close()

@app.route('/api/user/sync', methods=['POST'])
def user_sync():
    if 'user_id' not in session:
        return jsonify({"error": "Authentication required."}), 401
        
    data = request.get_json() or []
    if not isinstance(data, list):
        return jsonify({"error": "Invalid data format. Expected a list."}), 400
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        user_id = session['user_id']
        
        for item in data:
            video_id = item.get('videoId')
            video_url = item.get('videoUrl', f"https://www.youtube.com/watch?v={video_id}")
            title = item.get('title', 'YouTube Video')
            channel_name = item.get('channelName')
            channel_url = item.get('channelUrl')
            summary = item.get('summary', '')
            key_points = json.dumps(item.get('key_points', []))
            takeaway = item.get('takeaway', '')
            visual_elements = json.dumps(item.get('visual_elements')) if item.get('visual_elements') else None
            timestamp = item.get('timestamp', '')
            is_favorite = 1 if item.get('is_favorite') else 0
            
            if not video_id or not summary:
                continue
                
            cursor.execute('''
                INSERT INTO summaries 
                (user_id, video_id, video_url, title, channel_name, channel_url, summary, key_insights, takeaway, visual_elements, timestamp, is_favorite)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, video_id) DO UPDATE SET
                    is_favorite = MAX(is_favorite, excluded.is_favorite),
                    timestamp = CASE WHEN timestamp < excluded.timestamp THEN excluded.timestamp ELSE timestamp END
            ''', (user_id, video_id, video_url, title, channel_name, channel_url, summary, key_points, takeaway, visual_elements, timestamp, is_favorite))
            
        conn.commit()
        return jsonify({"success": True, "message": "Data synchronized successfully."})
    except Exception as e:
        logging.error(f"Sync error: {str(e)}")
        return jsonify({"error": "Failed to sync local data."}), 500
    finally:
        conn.close()

@app.route('/api/user/favorite/toggle', methods=['POST'])
def favorite_toggle():
    if 'user_id' not in session:
        return jsonify({"error": "Authentication required."}), 401
        
    data = request.get_json() or {}
    video_id = data.get('videoId')
    
    if not video_id:
        return jsonify({"error": "Video ID is required."}), 400
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        user_id = session['user_id']
        
        # Check if the summary exists for the user
        cursor.execute(
            'SELECT is_favorite FROM summaries WHERE user_id = ? AND video_id = ?',
            (user_id, video_id)
        )
        row = cursor.fetchone()
        
        if not row:
            return jsonify({"error": "Summary not found in history."}), 404
            
        new_fav = 0 if row['is_favorite'] else 1
        cursor.execute(
            'UPDATE summaries SET is_favorite = ? WHERE user_id = ? AND video_id = ?',
            (new_fav, user_id, video_id)
        )
        conn.commit()
        
        return jsonify({
            "success": True,
            "is_favorite": bool(new_fav),
            "message": "Favorite toggled successfully."
        })
    except Exception as e:
        logging.error(f"Favorite toggle error: {str(e)}")
        return jsonify({"error": "Failed to toggle favorite."}), 500
    finally:
        conn.close()

@app.route('/api/user/history/<video_id>', methods=['DELETE'])
def delete_summary(video_id):
    if 'user_id' not in session:
        return jsonify({"error": "Authentication required."}), 401
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM summaries WHERE user_id = ? AND video_id = ?',
            (session['user_id'], video_id)
        )
        conn.commit()
        return jsonify({"success": True, "message": "Summary deleted successfully."})
    except Exception as e:
        logging.error(f"Delete summary error: {str(e)}")
        return jsonify({"error": "Failed to delete summary."}), 500
    finally:
        conn.close()

@app.route('/api/user/history/clear', methods=['POST'])
def clear_user_history():
    if 'user_id' not in session:
        return jsonify({"error": "Authentication required."}), 401
        
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            'DELETE FROM summaries WHERE user_id = ?',
            (session['user_id'],)
        )
        conn.commit()
        return jsonify({"success": True, "message": "History cleared successfully."})
    except Exception as e:
        logging.error(f"Clear history error: {str(e)}")
        return jsonify({"error": "Failed to clear history."}), 500
    finally:
        conn.close()

if __name__ == '__main__':
    # Get port from environment or default to 5000
    port = int(os.getenv("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
