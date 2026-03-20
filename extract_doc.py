import sys
import subprocess

# Install python-docx
subprocess.check_call([sys.executable, "-m", "pip", "install", "python-docx", "-q"])

from docx import Document

doc_path = r'c:\Users\ujjwa\OneDrive\Desktop\Hack\devctx\devctx_PRD_TRD (1).docx'
doc = Document(doc_path)

# Extract all text
text = '\n'.join([para.text for para in doc.paragraphs])
print(text)
