.PHONY: all build install test clean release help

# Default target
all: build

# Build debug version
build:
	cargo build

# Build optimized release version
release:
	cargo build --release

# Install locally via cargo
install:
	cargo install --path .

# Install release binary to system
install-system: release
	@echo "Installing to /usr/local/bin (requires sudo)..."
	sudo cp target/release/glm-usage-monitor /usr/local/bin/

# Install to user directory
install-user: release
	@echo "Installing to ~/.local/bin..."
	mkdir -p ~/.local/bin
	cp target/release/glm-usage-monitor ~/.local/bin/

# Run tests
test:
	cargo test

# Run with test token
run:
	cargo run

# Check code without building
check:
	cargo check

# Format code
fmt:
	cargo fmt

# Run linter
clippy:
	cargo clippy

# Clean build artifacts
clean:
	cargo clean

# Update dependencies
update:
	cargo update

# Show help
help:
	@echo "Available targets:"
	@echo "  make all         - Build debug version (default)"
	@echo "  make build       - Build debug version"
	@echo "  make release     - Build optimized release version"
	@echo "  make install     - Install via cargo to ~/.cargo/bin"
	@echo "  make install-system - Install release binary to /usr/local/bin"
	@echo "  make install-user - Install release binary to ~/.local/bin"
	@echo "  make test        - Run tests"
	@echo "  make run         - Run the application"
	@echo "  make check       - Check code without building"
	@echo "  make fmt         - Format code"
	@echo "  make clippy      - Run linter"
	@echo "  make clean       - Clean build artifacts"
	@echo "  make update      - Update dependencies"
	@echo "  make help        - Show this help message"
