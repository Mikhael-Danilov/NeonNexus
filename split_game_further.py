import os

with open('app/src/main/assets/js/game.js', 'r') as f:
    lines = f.readlines()

def write_file(filename, start_line, end_line):
    with open(f'app/src/main/assets/js/{filename}', 'w') as f:
        f.writelines(lines[start_line:end_line])

# We know the indices:
# Logic: 0, Updates: 500, UI: 875, Loop: 1017, Init: 1053

write_file('input.js', 0, 253)
write_file('entities.js', 253, 500)
write_file('systems.js', 500, 875)
write_file('ui.js', 875, 1017)
write_file('main.js', 1017, len(lines))

print("Split completed.")
