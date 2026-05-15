# 1. Start with a lightweight, official Python image
FROM python:3.11-slim

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Copy the requirements file first (this makes future builds much faster!)
COPY requirements.txt .

# 4. Install all the dependencies we listed
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy the rest of your application code into the container
COPY . .

# 6. Expose the port that Google Cloud Run expects to use
EXPOSE 8080

# 7. Start the FastAPI server using Uvicorn
# We use $PORT so Google Cloud can dynamically assign the port when it wakes the server up
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]