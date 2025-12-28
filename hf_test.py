import os, requests, json
HF_API_URL = 'https://api-inference.huggingface.co/models'
CHAT_MODEL = 'mistralai/Mistral-7B-Instruct-v0.2'
HF_TOKEN = 'hf_AeoJqyvYjrtzBqergJcZqeZVpYIhYXXXXO'
headers = {'Authorization': f'Bearer {HF_TOKEN}'} if HF_TOKEN else {}
payload={'inputs':'Explain briefly what a car is.','parameters':{'max_new_tokens':200,'temperature':0.6,'return_full_text':False}}
url=f"{HF_API_URL}/{CHAT_MODEL}"
print('Posting to', url)
try:
    r = requests.post(url, headers=headers, json=payload, timeout=60)
    print('status', r.status_code)
    try:
        print(json.dumps(r.json(), indent=2)[:2000])
    except Exception:
        print('text:', r.text[:2000])
except Exception as e:
    print('error', str(e))
