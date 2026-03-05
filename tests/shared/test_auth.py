import pytest
from unittest.mock import patch, MagicMock
from shared.auth import get_google_service

def test_get_google_service_raises_if_no_credentials(tmp_path):
    """Should raise FileNotFoundError when credentials.json missing."""
    with patch("shared.auth.os.path.exists", side_effect=lambda path: False):
        with pytest.raises(FileNotFoundError, match="credentials.json"):
            get_google_service(
                scopes=["https://www.googleapis.com/auth/calendar"],
                token_path=str(tmp_path / "token.json"),
                credentials_path=str(tmp_path / "credentials.json"),
                service_name="calendar",
                service_version="v3",
            )

def test_get_google_service_loads_valid_token(tmp_path):
    """Should load credentials from token file when valid."""
    mock_creds = MagicMock()
    mock_creds.valid = True

    with patch("shared.auth.Credentials.from_authorized_user_file", return_value=mock_creds):
        with patch("shared.auth.os.path.exists", return_value=True):
            with patch("shared.auth.build") as mock_build:
                get_google_service(
                    scopes=["https://www.googleapis.com/auth/calendar"],
                    token_path=str(tmp_path / "token.json"),
                    credentials_path=str(tmp_path / "credentials.json"),
                    service_name="calendar",
                    service_version="v3",
                )
                mock_build.assert_called_once_with("calendar", "v3", credentials=mock_creds)
