from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv

from state import JobAppState
from nodes.scraper import scraper_node
from nodes.classifier import classifier_node
from nodes.optimizer_agent import optimizer_node
from nodes.sheets import sheets_reader_node, sheets_writer_node

load_dotenv()

def build_graph():
    """Builds the Job App Chain Graph"""
    builder = StateGraph(JobAppState)

    builder.add_node("scraper", scraper_node)
    builder.add_node("classifier", classifier_node)
    builder.add_node("optimizer", optimizer_node)
    builder.add_node("sheets_reader", sheets_reader_node)
    builder.add_node("sheets_writer", sheets_writer_node)

    builder.add_edge(START, "sheets_reader") 
    builder.add_edge("sheets_reader", "scraper")
    builder.add_edge("scraper", "classifier")
    builder.add_edge("classifier", "optimizer")
    builder.add_edge("optimizer", "sheets_writer")
    builder.add_edge("sheets_writer", END)

    return builder.compile()

graph = build_graph()