document.addEventListener('DOMContentLoaded', function () {
    const contentContainer = document.getElementById('content-container');
    const photoInput = document.getElementById('photos');
    const previewContainer = document.querySelector('.preview');
    const errorMessage = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');
    const clearAllButton = document.getElementById('clear-all-button');
    const skipButton = document.getElementById('skip-button');
    let allSelectedPhotos = [];

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
                if (allSelectedPhotos.length === 0) {
                    errorMessage.innerText = 'No photos selected';
                    return;
                }
                const formData = new FormData(this);
                allSelectedPhotos.forEach((file, index) => {
                    formData.append('photos', file, file.name);
                });

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

        if (clearAllButton) {
            clearAllButton.addEventListener('click', function () {
                clearAll();
            });
        }

        if (photoInput) {
            photoInput.addEventListener('change', updatePreview);
        }

        function updatePreview() {
            Array.from(photoInput.files).forEach((file, index) => {
                allSelectedPhotos.push(file);
                const reader = new FileReader();
                reader.onload = function (e) {
                    const photoItem = document.createElement('div');
                    photoItem.classList.add('photo-item');
                    photoItem.dataset.photoIndex = allSelectedPhotos.length - 1;

                    const photoContainer = document.createElement('div');
                    photoContainer.classList.add('photo-container');

                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.classList.add('photo-preview');

                    const removeButton = document.createElement('button');
                    removeButton.classList.add('remove-photo');
                    removeButton.innerText = 'X';
                    removeButton.dataset.photoIndex = allSelectedPhotos.length - 1;
                    removeButton.addEventListener('click', function () {
                        allSelectedPhotos.splice(photoItem.dataset.photoIndex, 1);
                        photoItem.remove();
                        checkPhotoCount();
                    });

                    photoContainer.appendChild(img);
                    photoContainer.appendChild(removeButton);
                    photoItem.appendChild(photoContainer);
                    previewContainer.appendChild(photoItem);
                }
                reader.readAsDataURL(file);
            });
            checkPhotoCount();
        }

        function checkPhotoCount() {
            const photoCount = allSelectedPhotos.length;
            submitButton.disabled = photoCount === 0;
            if (photoCount === 0 && errorMessage) {
                errorMessage.innerText = '';
            } else {
                errorMessage.innerText = '';
            }
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
                    const photoItem = document.querySelector(`#order-${orderIndex} .photo-item[data-photo-index="${photoIndex}"]`);
                    if (photoItem) {
                        photoItem.parentNode.removeChild(photoItem);
                    }
                    const orderList = document.querySelector(`#order-${orderIndex} .photo-list`);
                    if (orderList.children.length === 0) {
                        const orderElement = document.getElementById(`order-${orderIndex}`);
                        if (orderElement) {
                            orderElement.parentNode.removeChild(orderElement);
                        }
                        if (document.querySelectorAll('.order-list .photo-list').length === 0) {
                            loadContent('/load_content?page=index');
                        }
                    }
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
                    allSelectedPhotos = [];
                    loadContent(window.location.href); // Reload current content
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }

        checkPhotoCount(); // Initial check for photos
    }

    attachEventListeners(); // Initial attachment of event listeners
});