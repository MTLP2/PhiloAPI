#!/bin/bash
if [[ -f /usr/bin/ffmpeg ]] ; then echo "ffmpeg already installed" && exit; fi
wget -O /tmp/ffmpeg.tar.xz https://www.johnvansickle.com/ffmpeg/old-releases/ffmpeg-4.4.1-arm64-static.tar.xz
if [ ! -d /opt/ffmpeg ] ; then mkdir -p /opt/ffmpeg; fi
tar xvf /tmp/ffmpeg.tar.xz -C /opt/ffmpeg
if [[ ! -f /usr/bin/ffmpeg ]] ; then ln -sf /opt/ffmpeg/ffmpeg-4.4.1-arm64-static/ffmpeg /usr/bin/ffmpeg; fi
if [[ ! -f /usr/bin/ffprobe ]] ; then ln -sf /opt/ffmpeg/ffmpeg-4.4.1-arm64-static/ffprobe /usr/bin/ffprobe; fi
