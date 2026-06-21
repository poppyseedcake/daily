# Use SQLite as the Primary Database

Daily uses SQLite as the primary database for the first version. The product is a single Node-hosted application with modest relational data needs, and SQLite keeps local development and deployment simple; if user volume or concurrent write patterns outgrow it, the persistence layer can later be migrated to PostgreSQL.
