from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv

from state import JobAppState

from nodes import classifier

load_dotenv()

def build_graph():
    builder = StateGraph(JobAppState)

    # Nodes are functions that take in a state and return a state

    # Edges act as the flow of the graph

    return builder.compile()