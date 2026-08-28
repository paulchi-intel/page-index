# PageIndex

PageIndex lets a user prepare document indexes and ask grounded questions against indexed documents.

## Language

**Source Document**:
A PDF or Markdown file supplied by the user as the original material for indexing and preview.
_Avoid_: Source file, uploaded file

**Document Index**:
A structured representation derived from one Source Document and used to locate relevant sections during a query.
_Avoid_: JSON file, structure file

**Indexed Document**:
A Source Document that has a corresponding Document Index and is available for querying.
_Avoid_: File, document entry

**Query Session**:
The conversation in which a user asks questions about one selected Indexed Document.
_Avoid_: Chat, history

**Index Task**:
One attempt to create or replace the Document Index for a Source Document, including its progress and outcome.
_Avoid_: Upload task, job

**Document Preview**:
A read-only presentation of a Source Document or its indexed structure alongside the active work area.
_Avoid_: Viewer, popup
