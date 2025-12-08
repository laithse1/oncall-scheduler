
import os
import httpx
from email.message import EmailMessage
import smtplib

SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL")
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASS = os.getenv("SMTP_PASS")
FROM_EMAIL = os.getenv("FROM_EMAIL", "oncall-bot@example.com")

async def send_slack_message(text: str):
    if not SLACK_WEBHOOK_URL:
        return
    async with httpx.AsyncClient() as client:
        await client.post(SLACK_WEBHOOK_URL, json={"text": text})

def send_email(to_email: str, subject: str, body: str):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        return

    msg = EmailMessage()
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)
