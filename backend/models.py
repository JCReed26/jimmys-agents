"""
Organized models and api keys to import into agents preferred model 
also we can expand in the future to choose which model to use for the agent

"""
import os
from dotenv import load_dotenv
from langchain_openrouter import ChatOpenRouter

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")

gemini_flash_model = ChatOpenRouter(
    model="google/gemini-2.5-flash",
    api_key=OPENROUTER_API_KEY,
)

cheap_haiku_three_model = ChatOpenRouter(
    model="anthropic/claude-3-haiku",
    api_key=OPENROUTER_API_KEY,
)

free_qwen_threesixplus = ChatOpenRouter(
    model="qwen/qwen3.6-plus-preview:free",
    api_key=OPENROUTER_API_KEY,
)

free_nvidia_nemotron = ChatOpenRouter(
    model="nvidia/nemotron-3-super-120b-a12b:free",
    api_key=OPENROUTER_API_KEY,

)