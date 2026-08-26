import os

with open('app/src/main/assets/js/game.js', 'r') as f:
    lines = f.readlines()

def get_section(start_str, end_str=None):
    start_idx = -1
    end_idx = len(lines)
    for i, l in enumerate(lines):
        if start_str in l:
            start_idx = i
            break
    if end_str:
        for i in range(start_idx + 1, len(lines)):
            if end_str in l:
                end_idx = i
                break
    return lines[start_idx:end_idx]

# Let's just find the section headers exactly.
idx_logic = -1
idx_updates = -1
idx_ui = -1
idx_loop = -1
idx_init = -1

for i, l in enumerate(lines):
    if "GAME LOGIC & SYSTEMS" in l: idx_logic = i
    if "SYSTEM UPDATES" in l: idx_updates = i
    if "UI & GAME FLOW" in l: idx_ui = i
    if "GAME LOOP" in l: idx_loop = i
    if "INITIALIZATION SEQUENCE" in l: idx_init = i

print(f"Logic: {idx_logic}, Updates: {idx_updates}, UI: {idx_ui}, Loop: {idx_loop}, Init: {idx_init}")
