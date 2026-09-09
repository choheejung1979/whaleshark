import urllib.request
import os

logos = {
    "BFAR": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Bureau_of_Fisheries_and_Aquatic_Resources_%28BFAR%29.svg",
    "DOT": "https://upload.wikimedia.org/wikipedia/commons/2/25/Department_of_Tourism_%28DOT%29.svg",
    "PCG": "https://upload.wikimedia.org/wikipedia/commons/4/41/Philippine_Coast_Guard_%28PCG%29.svg",
    "DENR": "https://upload.wikimedia.org/wikipedia/commons/1/13/Department_of_Environment_and_Natural_Resources_%28DENR%29_logo.svg",
    "Antique": "https://upload.wikimedia.org/wikipedia/commons/a/ad/Ph_seal_antique.png",
    "Libertad": "https://upload.wikimedia.org/wikipedia/commons/3/36/Ph_seal_antique_libertad.png"
}

os.makedirs("assets/logos", exist_ok=True)

for name, url in logos.items():
    ext = url.split('.')[-1]
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as resp, open(f"assets/logos/{name}.{ext}", "wb") as f:
            f.write(resp.read())
        print(f"Downloaded {name}")
    except Exception as e:
        print(f"Error {name}: {e}")
