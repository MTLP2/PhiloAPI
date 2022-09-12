#!/bin/bash
sudo rm -f /etc/cron.d/mycron.bak

echo "
* * * * * root wget --delete-after https://api.diggersfactory.com/cron
0 * * * * root wget --delete-after https://api.diggersfactory.com/hourly
0 6 * * * root wget --delete-after https://api.diggersfactory.com/daily
" | sudo tee -a /etc/cron.d/mycron > /dev/null