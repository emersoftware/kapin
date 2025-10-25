# Dockerfile for KAPIN Sandbox Worker
# Provides a full Linux environment with git, Node.js, and Python
# for executing code analysis and instrumentation tasks

FROM debian:bookworm-slim

# Install system dependencies and tools
RUN apt-get update && apt-get install -y \
    # Version control
    git \
    # Build tools
    build-essential \
    make \
    gcc \
    g++ \
    # Python and pip
    python3 \
    python3-pip \
    python3-venv \
    # Node.js and npm (via NodeSource)
    curl \
    wget \
    ca-certificates \
    gnupg \
    # Utilities
    nano \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x LTS
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory
RUN mkdir -p /workspace
WORKDIR /workspace

# Configure git (required for cloning)
RUN git config --global user.name "KAPIN Agent" \
    && git config --global user.email "agent@kapin.dev" \
    && git config --global init.defaultBranch main

# Install common Python packages for data analysis and code parsing
RUN pip3 install --no-cache-dir \
    pandas \
    numpy \
    matplotlib \
    requests \
    gitpython

# Install common Node.js packages for code analysis
RUN npm install -g \
    typescript \
    ts-node \
    esbuild

# Set default shell to bash
SHELL ["/bin/bash", "-c"]

# Default command (will be overridden by sandbox exec)
CMD ["/bin/bash"]
