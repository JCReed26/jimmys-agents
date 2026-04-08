from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum 

class ActionType(Enum):
    IGNORE = "to ignore"
    READ = "to read"
    REPLY = "to reply"

class EmailAnalysis(BaseModel):
    """Analysis of a single email"""
    id: str = Field(..., description="The id of the email")
    thread_id: str = Field(..., description="The thread id of the email")
    sender: str = Field(..., description="The sender of the email")
    subject: str = Field(..., description="The subject of the email")
    action_type: ActionType = Field(..., description="The action to take on the email")
    suggested_reply: Optional[str] = Field(None, description="The suggested reply to the email")

class EmailBatch(BaseModel):
    """Batch of emails"""
    emails: List[EmailAnalysis] = Field(..., description="The emails to analyze")