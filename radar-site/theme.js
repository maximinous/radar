// Applique le thème choisi (clair ou sombre) avant l'affichage, pour éviter un flash de l'autre thème.
try{ var t = localStorage.getItem('radar-theme'); if(t==='light'||t==='dark') document.documentElement.dataset.theme = t; }catch(e){}
