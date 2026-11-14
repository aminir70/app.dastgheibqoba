(function(){
  function setH(){ document.documentElement.style.setProperty('--app-h', window.innerHeight+'px'); }
  setH();
  window.addEventListener('resize', setH);
  window.addEventListener('orientationchange', function(){ setTimeout(setH, 250); });
})();
