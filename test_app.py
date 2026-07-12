import unittest
from unittest.mock import patch, MagicMock
import json
import os
from app import app, extract_video_id

class YouTubeSummarizerTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        # Initialize the database file for test context
        from app import init_db
        init_db()
        
        self.client = app.test_client()
        self.old_key = os.environ.get("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = "mock_api_key"

    def tearDown(self):
        if self.old_key is not None:
            os.environ["GEMINI_API_KEY"] = self.old_key
        else:
            os.environ.pop("GEMINI_API_KEY", None)
            
        # Remove testing database
        if os.path.exists("test_database.db"):
            try:
                os.remove("test_database.db")
            except Exception:
                pass

    def test_extract_video_id(self):
        """Test robust YouTube video ID extraction."""
        valid_urls = [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "http://youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ",
            "https://youtube.com/live/dQw4w9WgXcQ?feature=share",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "dQw4w9WgXcQ" # Raw ID
        ]
        for url in valid_urls:
            self.assertEqual(extract_video_id(url), "dQw4w9WgXcQ")

        invalid_urls = [
            "https://www.google.com",
            "https://youtube.com",
            "",
            None
        ]
        for url in invalid_urls:
            self.assertIsNone(extract_video_id(url))

    def test_serve_index(self):
        """Test index page returns successfully."""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)

    def test_config_check(self):
        """Test configuration check response."""
        response = self.client.get('/api/config-check')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('configured', data)
        self.assertTrue(data['configured'])

    def test_summarize_missing_url(self):
        """Test error when no URL is provided."""
        response = self.client.post('/api/summarize', 
                                    data=json.dumps({}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)

    def test_summarize_invalid_url(self):
        """Test error for invalid YouTube URLs."""
        response = self.client.post('/api/summarize', 
                                    data=json.dumps({"url": "https://google.com"}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)

    @patch('app.fetch_youtube_transcript')
    @patch('google.generativeai.GenerativeModel')
    def test_summarize_success_mock(self, mock_gen_model, mock_fetch_transcript):
        """Test successful end-to-end mock AI summarization."""
        # 1. Mock Transcript Fetch
        mock_fetch_transcript.return_value = ("Hello world transcript content for testing. This is a longer mock transcript that has more than fifty characters to pass validation checks.", None)

        # 2. Mock Gemini API generate_content
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "summary": "This is a mock AI summary.",
            "key_points": [
                "**Mock Point 1**: Details about point 1.",
                "**Mock Point 2**: Details about point 2."
            ],
            "takeaway": "This is a mock final takeaway."
        })
        
        mock_model_instance = MagicMock()
        mock_model_instance.generate_content.return_value = mock_response
        mock_gen_model.return_value = mock_model_instance

        # 3. Post request to test
        response = self.client.post('/api/summarize', 
                                    data=json.dumps({"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}),
                                    content_type='application/json')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        
        self.assertEqual(data["videoId"], "dQw4w9WgXcQ")
        self.assertEqual(data["summary"], "This is a mock AI summary.")
        self.assertEqual(len(data["key_points"]), 2)
        self.assertEqual(data["takeaway"], "This is a mock final takeaway.")

    def test_signup_success(self):
        """Test user signup is successful."""
        response = self.client.post('/api/auth/signup',
                                    data=json.dumps({"username": "testuser", "password": "password123"}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 201)
        data = json.loads(response.data)
        self.assertTrue(data["success"])
        self.assertEqual(data["username"], "testuser")

    def test_signup_duplicate(self):
        """Test signup returns error for duplicate username."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        response = self.client.post('/api/auth/signup',
                                    data=json.dumps({"username": "testuser", "password": "differentpassword"}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn("error", data)

    def test_login_success(self):
        """Test login is successful with valid credentials."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        response = self.client.post('/api/auth/login',
                                    data=json.dumps({"username": "testuser", "password": "password123"}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data["success"])

    def test_login_failure(self):
        """Test login fails with invalid credentials."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        response = self.client.post('/api/auth/login',
                                    data=json.dumps({"username": "testuser", "password": "badpassword"}),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 401)

    def test_auth_status_logged_in(self):
        """Test auth status endpoints when logged in."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        response = self.client.get('/api/auth/status')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data["logged_in"])
        self.assertEqual(data["username"], "testuser")

    def test_auth_status_guest(self):
        """Test auth status when not logged in."""
        response = self.client.get('/api/auth/status')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data["logged_in"])

    def test_logout(self):
        """Test logging out clears the session."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        response = self.client.post('/api/auth/logout')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get('/api/auth/status')
        data = json.loads(response.data)
        self.assertFalse(data["logged_in"])

    def test_sync_history(self):
        """Test history synchronization merges guest history."""
        self.client.post('/api/auth/signup',
                         data=json.dumps({"username": "testuser", "password": "password123"}),
                         content_type='application/json')
        
        mock_sync_data = [
            {
                "videoId": "abc123xyz77",
                "videoUrl": "https://www.youtube.com/watch?v=abc123xyz77",
                "title": "Guest Video 1",
                "summary": "Mock summary content",
                "key_points": ["Point 1", "Point 2"],
                "takeaway": "Takeaway 1",
                "timestamp": "2026-07-12T12:00:00.000Z",
                "is_favorite": True
            }
        ]
        
        response = self.client.post('/api/user/sync',
                                    data=json.dumps(mock_sync_data),
                                    content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        response = self.client.get('/api/user/history')
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["videoId"], "abc123xyz77")
        self.assertTrue(data[0]["is_favorite"])

if __name__ == '__main__':
    unittest.main()
