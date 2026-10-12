"""
database.py
------------
Central SQLAlchemy engine / session configuration.

- Defaults to a local SQLite file for zero-config development.
- Set DATABASE_URL env var to point at PostgreSQL in staging/production, e.g.:
    postgresql+psycopg2://visionai:visionai@localhost:5432/visionai
- No mock/dummy data lives here. Every row in these tables is real,
  created via the API (or seed_admin.py for the first admin user only).
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./visionai.db")

# SQLite needs this connect_arg; Postgres does not.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def init_db() -> None:
    """Create all tables that don't exist yet. Safe to call on every startup."""
    import models  # noqa: F401  (ensures all models are registered on Base before create_all)
    Base.metadata.create_all(bind=engine)

    # Auto-migrate columns for existing SQLite database
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            # Check existing columns in videos
            result = conn.execute(text("PRAGMA table_info(videos)"))
            existing_cols = {row[1] for row in result.fetchall()}
            if existing_cols:
                if "processed_frames" not in existing_cols:
                    conn.execute(text("ALTER TABLE videos ADD COLUMN processed_frames INTEGER DEFAULT 0"))
                if "progress_percent" not in existing_cols:
                    conn.execute(text("ALTER TABLE videos ADD COLUMN progress_percent INTEGER DEFAULT 0"))
                conn.commit()

            # Check existing columns in face_embeddings
            result_faces = conn.execute(text("PRAGMA table_info(face_embeddings)"))
            existing_face_cols = {row[1] for row in result_faces.fetchall()}
            if existing_face_cols:
                if "pose_tag" not in existing_face_cols:
                    conn.execute(text("ALTER TABLE face_embeddings ADD COLUMN pose_tag VARCHAR DEFAULT 'FRONT'"))
                if "sharpness_score" not in existing_face_cols:
                    conn.execute(text("ALTER TABLE face_embeddings ADD COLUMN sharpness_score FLOAT DEFAULT 0.0"))
                conn.commit()
    except Exception as e:
        print(f"DB migration check note: {e}")


def get_db():
    """FastAPI dependency: yields a DB session, always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
