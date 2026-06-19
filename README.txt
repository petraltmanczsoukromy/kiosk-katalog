VERKON prodejní kiosek - pilot v5

Zmeny ve v5:
- produktove dlazdice a obrazky maji bile pozadi
- puvodni samostatny blok filtru byl odstranen
- zustal pouze dynamicky blok "Nalezeno v"
- pri prazdnem hledani ukazuje vsechny kapitoly s pocty
- pri hledani ukazuje jen kapitoly s aktualnimi vysledky

Spusteni:
python -m http.server 8080

Potom otevrit:
http://localhost:8080


Verze v5.1:
- navrat k rozlozeni v5
- horni blok vyhledavani + Nalezeno v je fixni a automaticky se schovava pri scrollu dolu
- pri scrollu nahoru se horni blok znovu zobrazi
- kosik zustava samostatne dostupny vpravo nahore
