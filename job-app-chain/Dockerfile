FROM python:3.13-slim
WORKDIR /app
COPY job-app-chain/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY shared/ ./shared/
COPY job-app-chain/ .
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]