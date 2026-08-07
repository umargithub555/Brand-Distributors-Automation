from bson import ObjectId


def encode_document(document):
    if isinstance(document, list):
        return [encode_document(item) for item in document]
    if isinstance(document, dict):
        encoded = {}
        for key, value in document.items():
            if isinstance(value, ObjectId):
                encoded[key] = str(value)
            elif isinstance(value, list):
                encoded[key] = [encode_document(item) for item in value]
            elif isinstance(value, dict):
                encoded[key] = encode_document(value)
            else:
                encoded[key] = value
        return encoded
    return document
