# Dockerfile for KAPIN Sandbox Worker
# Uses Cloudflare's official sandbox image which includes git, Node.js, Python, and common tools

FROM docker.io/cloudflare/sandbox:0.4.9

# On a Mac with Apple Silicon, you might need to specify the platform:
# FROM --platform=linux/arm64 docker.io/cloudflare/sandbox:0.4.9

# Required during local development to access exposed ports
EXPOSE 8080
