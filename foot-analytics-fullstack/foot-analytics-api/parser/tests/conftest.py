# Rend parse_fmi importable depuis les tests (le script vit dans le dossier parent).
import sys
from pathlib import Path

PARSER_DIR = Path(__file__).resolve().parent.parent
if str(PARSER_DIR) not in sys.path:
    sys.path.insert(0, str(PARSER_DIR))
