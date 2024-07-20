document.addEventListener('DOMContentLoaded', function () {
    const contentContainer = document.getElementById('content-container');

    function loadContent(url) {
        fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'text/html'
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            return response.text();
        })
        .then(html => {
            contentContainer.innerHTML = html;
            attachEventListeners(); // Re-attach event listeners after content load
        })
        .catch(error => console.error('Error loading content:', error));
    }

    function attachEventListeners() {
        document.querySelectorAll('.btn-next').forEach(button => {
            button.addEventListener('click', function () {
                const page = this.getAttribute('data-page');
                loadContent(`/load_content?page=${page}`);
            });
        });

        if (document.getElementById('orderForm')) {
            document.getElementById('orderForm').addEventListener('submit', function (e) {
                e.preventDefault();
                const formData = new FormData(this);
                fetch(this.action, {
                    method: 'POST',
                    body: formData
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok ' + response.statusText);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        loadContent(data.next_url); // Load next page
                    } else {
                        console.error('Error:', data.error);
                    }
                })
                .catch(error => console.error('Error:', error));
            });
        }

        if (document.getElementById('completeOrderForm')) {
            document.getElementById('completeOrderForm').addEventListener('submit', function (e) {
                e.preventDefault();
                const formData = new FormData(this);
                fetch(this.action, {
                    method: 'POST',
                    body: formData
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok ' + response.statusText);
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.success) {
                        loadContent(data.next_url); // Load confirmation page
                    } else {
                        console.error('Error:', data.error);
                    }
                })
                .catch(error => console.error('Error:', error));
            });
        }

        document.querySelectorAll('.remove-photo').forEach(button => {
            button.addEventListener('click', function () {
                const orderIndex = this.dataset.orderIndex;
                const photoIndex = this.dataset.photoIndex;
                removePhoto(orderIndex, photoIndex);
            });
        });

        if (document.getElementById('clear-all')) {
            document.getElementById('clear-all').addEventListener('click', function () {
                clearAll();
            });
        }

        function removePhoto(orderIndex, photoIndex) {
            fetch("/remove_photo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `order_index=${orderIndex}&photo_index=${photoIndex}`
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    loadContent(window.location.href); // Reload current content
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }

        function clearAll() {
            fetch("/clear_all", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok ' + response.statusText);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    loadContent(window.location.href); // Reload current content
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }
    }

    attachEventListeners(); // Initial attachment of event listeners
});