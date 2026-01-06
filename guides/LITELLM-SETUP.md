# LiteLLM Proxy Setup for Local LLMs

This guide explains how to use **LiteLLM** as a proxy to connect Auto Claude with local LLM providers like **LM Studio**, **Ollama**, or **LocalAI** that don't natively support the Anthropic API format.

---

## Why Use LiteLLM?

Auto Claude uses the **Anthropic SDK** which expects API endpoints in Anthropic's format (`/v1/messages`). Local LLM providers typically use the **OpenAI** format (`/v1/chat/completions`). LiteLLM translates between these formats automatically.

**Benefits:**
- ✅ Run Auto Claude with local models (no API costs!)
- ✅ Use LM Studio, Ollama, or any OpenAI-compatible backend
- ✅ Automatic format translation (Anthropic ↔ OpenAI)
- ✅ Drop unsupported parameters automatically

---

## Prerequisites

- **Python 3.8+** installed
- **LM Studio** (or another local LLM provider) running
- A loaded model in LM Studio (e.g., `devstral-small-2-24b-instruct-2512`)

---

## ✅ Tested Configuration

This setup has been successfully tested with the following configuration:

**Hardware:**
- **GPU:** AMD Radeon RX 7900 XTX (24GB VRAM)
- **Model:** `devstral-small-2-24b-instruct-2512` (15.21 GB)

**Recommended LM Studio Settings (for RX 7900 XTX):**
- **Context Length:** `32768` (leverage your 24GB VRAM!)
- **GPU Offload:** `40/40` (full GPU offloading)
- **CPU Thread Pool Size:** `9` (adjust based on your CPU)
- **Evaluation Batch Size:** `1024` (higher = faster inference)
- **Offload KV Cache to GPU Memory:** ✅ ON
- **Keep Model in Memory:** ✅ ON
- **Try mmap():** ✅ ON
- **Flash Attention:** ✅ ON
- **K/V Cache Quantization:** ❌ OFF (for maximum quality)

> **💡 Tip:** With 24GB VRAM, you can push context length even higher (up to 65536) depending on your model and use case.

---

## Step 1: Install LiteLLM

```bash
pip install litellm
```

Or if you're using Auto Claude's backend virtual environment:

```bash
cd apps/backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install litellm
```

---

## Step 2: Create `litellm_config.yaml`

Create a file named `litellm_config.yaml` in your project root:

```yaml
model_list:
  - model_name: local-model
    litellm_params:
      model: openai/local-model
      api_base: "http://localhost:1234/v1"
      api_key: "lm-studio"

litellm_settings:
  drop_params: true
  set_verbose: true
```

### Configuration Explained

| Setting | Description |
|---------|-------------|
| `model_name` | The name you'll use in Auto Claude (e.g., `local-model`) |
| `model` | Format: `openai/<model-name>` tells LiteLLM to use OpenAI format |
| `api_base` | Your LM Studio server URL (default: `http://localhost:1234/v1`) |
| `api_key` | Any dummy value (LM Studio doesn't require auth) |
| `drop_params` | **Important!** Drops Anthropic-specific params that LM Studio doesn't support |
| `set_verbose` | Enables debug logging (optional, helpful for troubleshooting) |

---

## Step 3: Start LiteLLM Proxy

Run LiteLLM with your config file:

```bash
litellm --config litellm_config.yaml
```

You should see output like:

```
LiteLLM: Proxy running on http://0.0.0.0:4000
```

**LiteLLM will now:**
- Listen on `http://localhost:4000`
- Forward requests to LM Studio at `http://localhost:1234`
- Translate between Anthropic and OpenAI formats

---

## Step 4: Configure Auto Claude

### Option A: Via UI (Recommended)

1. Open **Auto Claude**
2. Go to **Settings** → **API Profiles**
3. Create or edit a profile:
   - **Base URL:** `http://localhost:4000`
   - **API Key:** `lm-studio` (or any dummy value)
4. Click **"Refresh"** in the model selector
5. Select `local-model` from the dropdown
6. Save the profile

### Option B: Manual Configuration

Edit `~/.config/auto-claude-ui/profiles.json`:

```json
{
  "profiles": [
    {
      "id": "local-lm-studio",
      "name": "LM Studio (via LiteLLM)",
      "baseUrl": "http://localhost:4000",
      "apiKey": "lm-studio",
      "isActive": true
    }
  ]
}
```

---

## Step 5: Verify Setup

Test the connection:

```bash
curl http://localhost:4000/v1/models
```

Expected output:

```json
{
  "data": [
    {
      "id": "local-model",
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai"
    }
  ],
  "object": "list"
}
```

---

## Troubleshooting

### Error: "Unexpected endpoint or method"

**Cause:** Auto Claude is bypassing LiteLLM and hitting LM Studio directly.

**Solution:** Ensure your profile's `baseUrl` is `http://localhost:4000` (LiteLLM), **not** `http://localhost:1234` (LM Studio).

---

### Error: `litellm.UnsupportedParamsError`

**Cause:** LM Studio doesn't support Anthropic-specific parameters like `thinking_budget`.

**Solution:** Ensure `drop_params: true` is set in `litellm_config.yaml`.

---

### Model Not Showing in Dropdown

1. Verify LiteLLM is running: `curl http://localhost:4000/v1/models`
2. Click the **"Refresh"** button in Auto Claude's model selector
3. Check LiteLLM logs for errors

---

### LM Studio Not Responding

1. Ensure LM Studio server is running (should show `Ready` status)
2. Verify port `1234` is correct in `litellm_config.yaml`
3. Test LM Studio directly: `curl http://localhost:1234/v1/models`

---

## Advanced: Multiple Models

You can configure multiple models in `litellm_config.yaml`:

```yaml
model_list:
  - model_name: llama-3-70b
    litellm_params:
      model: openai/llama-3-70b
      api_base: "http://localhost:1234/v1"
      api_key: "lm-studio"
  
  - model_name: mistral-7b
    litellm_params:
      model: openai/mistral-7b
      api_base: "http://localhost:1234/v1"
      api_key: "lm-studio"
```

All models will appear in Auto Claude's model selector after clicking **"Refresh"**.

---

## Running LiteLLM in Background

### Linux/macOS

```bash
nohup litellm --config litellm_config.yaml > litellm.log 2>&1 &
```

### Windows (PowerShell)

```powershell
Start-Process -NoNewWindow -FilePath "litellm" -ArgumentList "--config litellm_config.yaml"
```

### Using systemd (Linux)

Create `/etc/systemd/system/litellm.service`:

```ini
[Unit]
Description=LiteLLM Proxy
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/Auto-Claude_LM-Studio
ExecStart=/usr/local/bin/litellm --config litellm_config.yaml
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable litellm
sudo systemctl start litellm
```

---

## Resources

- **LiteLLM Documentation:** https://docs.litellm.ai/
- **LM Studio:** https://lmstudio.ai/
- **Auto Claude Discord:** https://discord.gg/KCXaPBr4Dj

---

**Need help?** Join our [Discord community](https://discord.gg/KCXaPBr4Dj) for support!
