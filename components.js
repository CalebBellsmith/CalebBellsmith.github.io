// components.js

function injectCommonElements() {
    // 1. Inject Navbar
    const navHTML = `
    <nav class="navbar navbar-expand-lg navbar-dark sticky-top">
        <div class="container">
            <a class="navbar-brand fw-bold" href="index.html">${SITE_DATA.contact.name}</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <div class="navbar-nav ms-auto">
                    <a class="nav-link" href="index.html">Home</a>
                    <a class="nav-link" href="projects.html">Projects</a>
                    <a class="nav-link" href="about.html">About</a>
                </div>
            </div>
        </div>
    </nav>`;

    // 2. Inject Footer
    const footerHTML = `
    <footer class="bg-dark text-white py-5">
        <div class="container text-center">
            <h4 class="mb-3">Contact Me</h4>
            <p class="mb-1">Email: <a href="mailto:${SITE_DATA.contact.email}" class="text-info text-decoration-none">${SITE_DATA.contact.email}</a></p>
            <p class="mb-1">Phone: <a href="tel:${SITE_DATA.contact.phone.replace(/\s/g, '')}" class="text-info text-decoration-none">${SITE_DATA.contact.phone}</a></p>
            <div class="mt-3">
                <a href="${SITE_DATA.contact.linkedin}" target="_blank" class="text-white mx-2 text-decoration-none">LinkedIn</a>
            </div>
        </div>
    </footer>`;

    // Place them in the DOM
    document.body.insertAdjacentHTML('afterbegin', navHTML);
    document.body.insertAdjacentHTML('beforeend', footerHTML);
}
