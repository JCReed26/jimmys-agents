import sys
from pathlib import Path

# Add job-app-chain root to sys.path so 'state', 'nodes.*' are importable without relative imports
sys.path.insert(0, str(Path(__file__).parent))
