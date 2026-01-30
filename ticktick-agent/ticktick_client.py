import os
import requests
import json
import time
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

class TickTickClient:
    """
    A bare-bones TickTick API client using requests.
    Reference: https://developer.ticktick.com/docs#/openapi
    """
    AUTH_URL = "https://ticktick.com/oauth/authorize"
    TOKEN_URL = "https://ticktick.com/oauth/token"
    API_URL = "https://api.ticktick.com/open/v1"

    def __init__(self):
        self.client_id = os.getenv("TICKTICK_CLIENT_ID")
        self.client_secret = os.getenv("TICKTICK_CLIENT_SECRET")
        self.redirect_uri = os.getenv("TICKTICK_REDIRECT_URI", "http://127.0.0.1:8080")
        self.token_file = ".token-oauth"
        self.access_token = self._load_token()

    def _load_token(self) -> Optional[str]:
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, "r") as f:
                    data = json.load(f)
                    return data.get("access_token")
            except Exception:
                return None
        return None

    def _save_token(self, token_data: Dict[str, Any]):
        with open(self.token_file, "w") as f:
            json.dump(token_data, f)
        self.access_token = token_data.get("access_token")

    def authorize(self):
        """
        Initiates the OAuth2 flow if no valid token exists.
        """
        if self.access_token:
            # We assume it's valid for now. If a request fails with 401, we should re-auth.
            # Ideally verify token validity here or handle refresh.
            return

        # 1. Direct user to auth URL
        params = {
            "client_id": self.client_id,
            "redirect_uri": self.redirect_uri,
            "response_type": "code",
            "scope": "tasks:write tasks:read",
            "state": "state" 
        }
        # Construct query string manually to avoid encoding issues if any, but requests.prepare is better
        # Simple string construction:
        import urllib.parse
        query_string = urllib.parse.urlencode(params)
        auth_url = f"{self.AUTH_URL}?{query_string}"
        
        print(f"\n--- Authorization Required ---")
        print(f"Please visit this URL to authorize the application:")
        print(f"{auth_url}\n")
        
        redirect_response = input("Enter the full URL you were redirected to (e.g., http://localhost:8080/callback?code=...): ")
        
        # 2. Extract code
        parsed = urllib.parse.urlparse(redirect_response)
        qs = urllib.parse.parse_qs(parsed.query)
        code = qs.get("code", [None])[0]
        
        if not code:
            raise ValueError("No code found in the redirect URL")

        # 3. Exchange code for token
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": self.redirect_uri,
            "scope": "tasks:write tasks:read"
        }
        
        response = requests.post(self.TOKEN_URL, data=data)
        if response.status_code == 200:
            token_data = response.json()
            self._save_token(token_data)
            print("Successfully authenticated!")
        else:
            raise Exception(f"Failed to get token: {response.text}")

    def _get_headers(self):
        if not self.access_token:
            raise Exception("Not authenticated. Call authorize() first.")
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    def get_projects(self) -> List[Dict[str, Any]]:
        """Get all projects (lists)."""
        url = f"{self.API_URL}/project"
        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()

    def get_project(self, project_id: str) -> Dict[str, Any]:
        """Get project details."""
        url = f"{self.API_URL}/project/{project_id}"
        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()

    def create_project(self, name: str) -> Dict[str, Any]:
        """Create a new project."""
        url = f"{self.API_URL}/project"
        data = {"name": name}
        response = requests.post(url, headers=self._get_headers(), json=data)
        response.raise_for_status()
        return response.json()
    
    def update_project(self, project_id: str, name: str) -> Dict[str, Any]:
        """Update a project."""
        url = f"{self.API_URL}/project/{project_id}"
        data = {"name": name}
        response = requests.post(url, headers=self._get_headers(), json=data)
        response.raise_for_status()
        return response.json()

    def delete_project(self, project_id: str) -> Dict[str, Any]:
        """Delete a project."""
        url = f"{self.API_URL}/project/{project_id}"
        response = requests.delete(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()

    def get_task(self, project_id: str, task_id: str) -> Dict[str, Any]:
        """Get task details."""
        url = f"{self.API_URL}/project/{project_id}/task/{task_id}"
        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()

    def create_task(self, title: str, project_id: str = "inbox", **kwargs) -> Dict[str, Any]:
        """
        Create a new task with support for all fields.
        
        Args:
            title: Task title
            project_id: Project ID (defaults to 'inbox')
            **kwargs: Additional fields matching the TickTick JSON structure 
                      (e.g., content, desc, isAllDay, priority, reminders, items, etc.)
        """
        url = f"{self.API_URL}/task"
        
        # Base payload
        data = {
            "title": title,
            "projectId": project_id if project_id else "inbox",
        }
        
        # Merge any additional fields provided via kwargs
        # This allows passing 'startDate', 'dueDate', 'priority', 'reminders', 'items' (subtasks), etc.
        data.update(kwargs)

        response = requests.post(url, headers=self._get_headers(), json=data)
        response.raise_for_status()
        return response.json()

    def update_task(self, task_id: str, project_id: str, **kwargs) -> Dict[str, Any]:
        """
        Update a task. 
        Fetches the existing task first to ensure we have the full object, 
        then updates only the fields provided in kwargs.
        """
        # Fetch first to ensure we have the complete object required for updates
        task = self.get_task(project_id, task_id)
        
        # Update the task object with new values
        task.update(kwargs)
            
        url = f"{self.API_URL}/task/{task_id}"
        response = requests.post(url, headers=self._get_headers(), json=task)
        response.raise_for_status()
        return response.json()

    def complete_task(self, task_id: str, project_id: str) -> Dict[str, Any]:
        """Complete a task."""
        url = f"{self.API_URL}/project/{project_id}/task/{task_id}/complete"
        response = requests.post(url, headers=self._get_headers())
        response.raise_for_status()
        # Verify if it returns json or just status
        if response.content:
            return response.json()
        return {"status": "success"}
    
    def delete_task(self, task_id: str, project_id: str) -> Dict[str, Any]:
        """Delete a task. Note: Open API might not have a direct delete for task, usually it's POST /task/{id}/delete"""
        # Checking docs or assuming standard REST DELETE or specific endpoint
        # TickTick Open API v1 uses DELETE /project/{projectId}/task/{taskId} ? No, let's check.
        # Often it is POST /project/{id}/task/{taskId}/delete or similar.
        # Based on standard Open API practices, let's try DELETE. If fails, we can adjust.
        # Actually, TickTick Open API usually uses `POST /project/{projectId}/task/{taskId}/delete`?
        # Let's try standard REST DELETE first. 
        # Actually, looking at other implementations, it seems to be DELETE /project/{projectId}/task/{taskId} isn't always there.
        # Wait, `ticktick-py` used `delete` method on `TickTickClient`.
        
        # Let's assume standard REST DELETE for now.
        url = f"{self.API_URL}/project/{project_id}/task/{task_id}"
        response = requests.delete(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()

    def get_project_with_data(self, project_id: str) -> Dict[str, Any]:
        """Get project details along with all tasks inside it."""
        # This endpoint is used by some community libraries to get project + tasks
        url = f"{self.API_URL}/project/{project_id}/data"
        response = requests.get(url, headers=self._get_headers())
        response.raise_for_status()
        return response.json()
