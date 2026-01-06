import requests

try:
    response = requests.get("http://localhost:4000/v1/models")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
