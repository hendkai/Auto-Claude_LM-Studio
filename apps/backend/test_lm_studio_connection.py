
import asyncio
import os
import sys
from pathlib import Path

# Add backend to sys.path to allow imports
backend_path = Path(__file__).parent
sys.path.append(str(backend_path))
# Also add the root of the backend modules if they expect to be run from apps/backend
sys.path.append(str(backend_path.parent))
sys.path.append(str(backend_path / "runners")) # For relative imports inside runners to work if needed


from runners.ai_analyzer.lm_studio_client import LMStudioAnalysisClient

async def test_connection():
    print("Testing LM Studio Connection...")
    
    # Mock project directory
    project_dir = Path("./")
    
    # Initialize client (uses defaults or env vars)
    # Ensure env vars are set if needed, or rely on defaults in the class
    # Default in class: http://localhost:1234/v1
    
    try:
        client = LMStudioAnalysisClient(project_dir)
        print(f"Client initialized. Base URL: {client.base_url}")
        
        prompt = "Hello, are you working? Please reply with 'Yes, I am working'."
        print(f"Sending prompt: {prompt}")
        
        response = await client.run_analysis_query(prompt)
        
        print("-" * 20)
        print("Response received:")
        print(response)
        print("-" * 20)
        
        if "Error" in response:
             print("❌ Test Failed: Error in response")
             sys.exit(1)
        else:
             print("✅ Test Passed: Connection successful")

    except Exception as e:
        print(f"❌ Test Failed: Exception occurred: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    # Force generic provider env vars just in case, though client defaults should work
    if not os.getenv("LM_STUDIO_BASE_URL"):
        os.environ["LM_STUDIO_BASE_URL"] = "http://localhost:1234/v1"
        
    asyncio.run(test_connection())
