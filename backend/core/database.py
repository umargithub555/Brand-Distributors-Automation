from pymongo import MongoClient

from backend.core.config import get_settings


_settings = get_settings()
_mongo_client = MongoClient(_settings.mongo_url)
db = _mongo_client[_settings.mongo_db_name]
