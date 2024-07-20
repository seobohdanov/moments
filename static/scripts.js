document.addEventListener('DOMContentLoaded', function () {
    const contentContainer = document.getElementById('content-container');

    function loadContent(url) {
        fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'text/html'
            }
        })
        .then(response => response.text())
        .then(html => {
            contentContainer.innerHTML = html;
            attachEventListeners(); // Re-attach event listeners after content load
        })
        .catch(error => console.error('Error loading content:', error));
    }

    function attachEventListeners() {
        document.getElementById('orderForm').addEventListener('submit', function (e) {
            e.preventDefault();
            const formData = new FormData(this);
            fetch(this.action, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    loadContent(data.next_url); // Load order summary
                } else {
                    console.error('Error:', data.error);
                }
            })
            .catch(error => console.error('Error:', error));
        });

        document.querySelectorAll('.btn-next').forEach(button => {
            button.addEventListener('click', function () {
                loadContent(this.dataset.url);
            });
        });

        document.querySelectorAll('.remove-photo').forEach(button => {
            button.addEventListener('click', function () {
                const orderIndex = this.dataset.orderIndex;
                const photoIndex = this.dataset.photoIndex;
                removePhoto(orderIndex, photoIndex);
            });
        });

        function removePhoto(orderIndex, photoIndex) {
            fetch("/remove_photo", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: `order_index=${orderIndex}&photo_index=${photoIndex}`
            }).then(response => response.json()).then(data => {
                if (data.success) {
                    loadContent(window.location.href); // Reload current content
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
            }).catch(error => {
                console.error('Error:', error);
            });
        }
    }

    attachEventListeners(); // Initial attachment of event listeners
});