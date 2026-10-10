FROM ghcr.io/denoland/deno:2.8.3

RUN apt-get update && apt-get install -y \
    fish \
    sudo \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 -s /usr/bin/fish dev && \
    echo "dev ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

RUN mkdir -p /home/dev/.config/fish/conf.d && \
    chown -R dev:dev /home/dev

COPY --chown=dev:dev fish_config.fish /home/dev/.config/fish/conf.d/custom.fish

ENV DENO_DIR=/home/dev/.cache/deno

USER dev
WORKDIR /home/dev
