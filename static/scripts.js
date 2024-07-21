document.addEventListener('DOMContentLoaded', function () {
    const contentContainer = document.getElementById('content-container');
    const photoInput = document.getElementById('photos');
    const previewContainer = document.querySelector('.preview');
    const errorMessage = document.getElementById('error-message');
    const submitButton = document.getElementById('submit-button');
    const clearAllButton = document.getElementById('clear-all-button');
    const skipButton = document.getElementById('skip-button');
    const progressBar = document.getElementById('progress-bar');
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

                const xhr = new XMLHttpRequest();
                xhr.open('POST', this.action, true);
                xhr.upload.addEventListener('progress', function (e) {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        progressBar.style.width = percentComplete + '%';
                        progressBar.innerText = Math.round(percentComplete) + '%';
                    }
                });

                xhr.addEventListener('load', function () {
                    if (xhr.status === 200) {
                        const response = JSON.parse(xhr.responseText);
                        if (response.success) {
                            allSelectedPhotos = []; // Clear the selected photos after adding to order
                            loadContent(response.next_url);
                        } else {
                            console.error('Error:', response.error);
                        }
                    } else {
                        console.error('Network response was not ok');
                    }
                });

                xhr.addEventListener('error', function () {
                    console.error('Error during the upload');
                });

                xhr.send(formData);
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
            photoInput.addEventListener('change', handleFileSelect);
        }

        function handleFileSelect(event) {
            Array.from(event.target.files).forEach(file => {
                allSelectedPhotos.push(file);
            });
            updatePreview();
            checkPhotoCount();
        }

        function updatePreview() {
            previewContainer.innerHTML = '';
            allSelectedPhotos.forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const photoItem = document.createElement('div');
                    photoItem.classList.add('photo-item');
                    photoItem.dataset.photoIndex = index;

                    const photoContainer = document.createElement('div');
                    photoContainer.classList.add('photo-container');

                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.classList.add('photo-preview');

                    const removeButton = document.createElement('button');
                    removeButton.classList.add('remove-photo');
                    removeButton.innerText = 'X';
                    removeButton.dataset.photoIndex = index;
                    removeButton.addEventListener('click', function () {
                        allSelectedPhotos.splice(photoItem.dataset.photoIndex, 1);
                        updatePreview();
                        checkPhotoCount();
                        if (allSelectedPhotos.length === 0) {
                            clearAll();
                        }
                    });

                    photoContainer.appendChild(img);
                    photoContainer.appendChild(removeButton);
                    photoItem.appendChild(photoContainer);
                    previewContainer.appendChild(photoItem);
                }
                reader.readAsDataURL(file);
            });
            photoInput.value = ''; // Clear the file input to allow re-selecting the same files if needed
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
                    if (data.redirect_url) {
                        window.location.href = data.redirect_url;
                    } else {
                        loadContent('/load_content?page=order_summary');
                    }
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
                updateIndices();
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
                    if (data.redirect_url) {
                        window.location.href = data.redirect_url;
                    } else {
                        allSelectedPhotos = [];
                        updatePreview();
                        checkPhotoCount();
                        loadContent('/');
                    }
                } else {
                    console.error(`Error from server: ${data.error}`);
                }
            })
            .catch(error => {
                console.error('Error:', error);
            });
        }

        function updateIndices() {
            document.querySelectorAll('.photo-item').forEach((item, index) => {
                item.dataset.photoIndex = index;
                item.querySelector('.remove-photo').dataset.photoIndex = index;
            });
        }

        checkPhotoCount(); // Initial check for photos
    }

    attachEventListeners(); // Initial attachment of event listeners
});