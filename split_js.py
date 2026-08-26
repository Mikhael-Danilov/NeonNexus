import re

with open('app/src/main/assets/index.html', 'r') as f:
    content = f.read()

script_start = content.find('<script>')
script_end = content.find('</script>', script_start)

html_top = content[:script_start]
js_content = content[script_start + 8 : script_end]
html_bottom = content[script_end + 9:]

# We'll split the js_content based on some markers.
# Let's extract sections manually.

def extract_section(start_marker, end_marker):
    start = js_content.find(start_marker)
    if end_marker:
        end = js_content.find(end_marker)
        return js_content[start:end]
    return js_content[start:]

js_engine = extract_section('// LOADING & DEBUG', '// THREE.JS SETUP')
js_graphics = extract_section('// THREE.JS SETUP', '// AUDIO ENGINE')
js_audio = extract_section('// AUDIO ENGINE', '// GAME LOGIC & SYSTEMS')
js_game = extract_section('// GAME LOGIC & SYSTEMS', None)

import os
os.makedirs('app/src/main/assets/js', exist_ok=True)

with open('app/src/main/assets/js/engine.js', 'w') as f:
    f.write(js_engine.strip() + '\n')

with open('app/src/main/assets/js/graphics.js', 'w') as f:
    f.write(js_graphics.strip() + '\n')
    
with open('app/src/main/assets/js/audio.js', 'w') as f:
    f.write(js_audio.strip() + '\n')
    
with open('app/src/main/assets/js/game.js', 'w') as f:
    f.write(js_game.strip() + '\n')
    
new_html = html_top + """
    <script src="js/engine.js"></script>
    <script src="js/graphics.js"></script>
    <script src="js/audio.js"></script>
    <script src="js/game.js"></script>
""" + html_bottom

with open('app/src/main/assets/index.html', 'w') as f:
    f.write(new_html)

print("Split completed.")
