from langgraph.graph import StateGraph, START, END
from dotenv import load_dotenv, find_dotenv
load_dotenv(find_dotenv())
from state import JobAppState
from nodes.scraper import scraper_node
from nodes.classifier import classifier_node
from nodes.optimizer_agent import optimizer_node
from nodes.sheets import sheets_reader_node, sheets_writer_node


def _route_after_sheets_reader(state: JobAppState) -> str:
    """Check for errors after sheets reader, otherwise proceed to scraper."""
    if state.get("error_message"):
        return "sheets_writer"
    return "scraper"


def _route_after_scraper(state: JobAppState) -> str:
    """Check for errors after scraper, otherwise proceed to classifier."""
    if state.get("error_message"):
        return "sheets_writer"
    return "classifier"


def _route_after_classifier(state: JobAppState) -> str:
    """Check for errors after classifier, or skip optimizer if no approved jobs."""
    if state.get("error_message"):
        return "sheets_writer"
    if not state.get("approved_jobs"):
        return "sheets_writer"
    return "optimizer"


def build_graph():
    """Builds the Job App Chain Graph"""
    builder = StateGraph(JobAppState)

    builder.add_node("scraper", scraper_node)
    builder.add_node("classifier", classifier_node)
    builder.add_node("optimizer", optimizer_node)
    builder.add_node("sheets_reader", sheets_reader_node)
    builder.add_node("sheets_writer", sheets_writer_node)

    builder.add_edge(START, "sheets_reader")
    builder.add_conditional_edges("sheets_reader", _route_after_sheets_reader, ["scraper", "sheets_writer"])
    
    # Scraper -> Classifier (conditional on error)
    builder.add_conditional_edges("scraper", _route_after_scraper, ["classifier", "sheets_writer"])
    
    # Classifier -> Optimizer (conditional on error or empty list)
    builder.add_conditional_edges("classifier", _route_after_classifier, ["optimizer", "sheets_writer"])
    
    builder.add_edge("optimizer", "sheets_writer")
    builder.add_edge("sheets_writer", END)

    return builder.compile()

graph = build_graph()

def visualize_graph():
    """Generates and displays the graph visualization."""
    try:
        from IPython.display import Image, display
        display(Image(graph.get_graph().draw_mermaid_png()))
        print("Graph visualization displayed.")
    except Exception as e:
        print(f"Could not visualize graph: {e}")
        print("Ensure 'ipython' and 'langgraph' are installed.")

if __name__ == "__main__":
    visualize_graph()
