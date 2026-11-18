# Security

Please report security problems privately: on this repository's **Security** tab, choose **Report a vulnerability**. Do not open a public issue for them.

Useful to include: the OpenPub version (shown in Windows Settings › Apps for the installed app, or on the first line of `README.txt` in the portable folder), whether you use the installer, the portable zip or the browser build, and the steps or file that show the problem. A `.pub` or `.opub` file that triggers it helps most; it stays private to the report.

Only the latest release gets fixes.

OpenPub opens `.pub` files with its own parser, entirely on your computer, and the desktop app makes no network requests. Areas where a report is especially welcome: a crafted `.pub` or `.opub` file that crashes the app or runs code, a plug-in or content pack that escapes its trust warning, and anything that lets a page write to a file the user did not choose.
