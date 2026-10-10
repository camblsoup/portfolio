# Disable the welcome message
set fish_greeting

# Improve cargo build colors
set -x CARGO_TERM_COLOR always

# Custom prompt
function fish_prompt
    # Set the name of your box manually since we know this is the 'utils' box
    echo -n "[🖳 "
    set -l box_name "myOS"
    set -l box_colour "cyan"

    # Optional: Add a 'box' icon to make it stand out
    set_color $box_colour
    echo -n "$USER"

    set_color normal
    echo -n "@$box_name] "

    # Show the current working directory in blue
    set_color $box_colour
    echo -n (prompt_pwd)

    # Reset color for the actual prompt symbol
    set_color normal
    echo -n "> "
end
