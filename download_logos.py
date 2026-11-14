import urllib.request
import urllib.parse
import json
import os

queries = [
    ("BFAR", "Bureau of Fisheries and Aquatic Resources (Philippines) logo"),
    ("DOT", "Department of Tourism (Philippines) logo"),
    ("PCG", "Philippine Coast Guard logo"),
    ("PTAA", "PTAA logo Philippine Travel Agencies Association"),
    ("PHILTOA", "PHILTOA logo"),
    ("Antique", "Province of Antique logo seal"),
    ("Libertad", "Libertad, Antique seal logo"),
    ("DENR", "Department of Environment and Natural Resources (Philippines) logo")
]

os.makedirs('assets/logos', exist_ok=True)

# Using duckduckgo lite or wikimedia API
def download_image(name, query):
    print(f"Searching for {name}...")
    # Actually Wikimedia Commons API is better for logos
    search_url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=" + urllib.parse.quote(query + " filetype:bitmap|drawing") + "&utf8=&format=json"
    try:
        req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        data = json.loads(response.read())
        if data['query']['search']:
            title = data['query']['search'][0]['title']
            # Get file url
            file_url_api = "https://commons.wikimedia.org/w/api.php?action=query&titles=" + urllib.parse.quote(title) + "&prop=imageinfo&iiprop=url&format=json"
            req2 = urllib.request.Request(file_url_api, headers={'User-Agent': 'Mozilla/5.0'})
            response2 = urllib.request.urlopen(req2)
            data2 = json.loads(response2.read())
            pages = data2['query']['pages']
            page = list(pages.values())[0]
            if 'imageinfo' in page:
                url = page['imageinfo'][0]['url']
                ext = url.split('.')[-1].lower()
                save_path = f"assets/logos/{name}.{ext}"
                urllib.request.urlretrieve(url, save_path)
                print(f"Downloaded {name} to {save_path}")
                return True
    except Exception as e:
        print(f"Failed {name}: {e}")
    return False

for name, query in queries:
    download_image(name, query)

print("Done")
