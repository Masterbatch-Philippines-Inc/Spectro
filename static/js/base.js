
/* 
 *  Call all scripts within ../shared/ folder
 *  This will iterate to files constant for each respective script component
 */

(function loadSharedScripts() {
  const thisScript = document.currentScript;
  const base = thisScript.getAttribute('data-static-base') || '/static/';
  const files = [
    // Orchestrator file
    'js/shared/app.js',

    // Component shared across pages
    'js/shared/global/header.js',
    'js/shared/global/sidebar.js',
    'js/shared/global/footer.js',
    'js/shared/global/toast.js',
    'js/shared/global/modal.js',

    // Every UI functionality
    'js/shared/ui/button.js',
    'js/shared/ui/color_offset.js',
    'js/shared/ui/color_simulation.js',
    'js/shared/ui/dropdown.js',
    'js/shared/ui/forms.js',
    'js/shared/ui/scatter_graph.js',
    'js/shared/ui/table.js',
    'js/shared/ui/tooltip.js',
  ];

  files.forEach(function (path) {
    const s = document.createElement('script');
    s.src = base + path;
    s.defer = true;
    document.head.appendChild(s);
  });
})();

/* 
 *  Initialize app.js to call each function components of the project
 *  initApp() = List of dependent functions listed in app.js
 */

window.addEventListener('load', function () {
  initApp();
});

