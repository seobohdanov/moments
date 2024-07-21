document.addEventListener('DOMContentLoaded', function () {
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
            document.querySelector('#content-container').innerHTML = html;
            attachEventListeners(); // Re-attach event listeners after content load
            if (url.includes('order_form')) {
                updatePreview();
            }
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

        const orderForm = document.getElementById('orderForm');
        if (orderForm) {
            orderForm.addEventListener('submit', function (e) {
                e.preventDefault();
                if (allSelectedPhotos.length === 0) {
                    document.getElementById('error-message').innerText = 'No photos selected';
                    return;
                }
                const formData = new FormData(orderForm);
                allSelectedPhotos.forEach((file, index) => {
                    formData.append('photos', file, file.name);
                });

                const xhr = new XMLHttpRequest();
                xhr.open('POST', orderForm.action, true);
                xhr.upload.addEventListener('progress', function (e) {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        document.getElementById('progress-bar').style.width = percentComplete + '%';
                        document.getElementById('progress-bar').innerText = Math.round(percentComplete) + '%';
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

        const completeOrderForm = document.getElementById('completeOrderForm');
        if (completeOrderForm) {
            completeOrderForm.addEventListener('submit', function (e) {
                e.preventDefault();
                const formData = new FormData(completeOrderForm);
                fetch(completeOrderForm.action, {
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

        if (document.getElementById('clear-all-button')) {
            document.getElementById('clear-all-button').addEventListener('click', function () {
                clearAll();
            });
        }

        if (document.getElementById('clear-all')) {
            document.getElementById('clear-all').addEventListener('click', function () {
                clearAll();
            });
        }

        const photoInput = document.getElementById('photos');
        if (photoInput) {
            photoInput.addEventListener('change', handleFileSelect);
        }
    }

    function handleFileSelect(event) {
        Array.from(event.target.files).forEach(file => {
            allSelectedPhotos.push(file);
        });
        updatePreview();
        checkPhotoCount();
    }

    function updatePreview() {
        const previewContainer = document.querySelector('.preview');
        if (previewContainer) {
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
            document.getElementById('photos').value = ''; // Clear the file input to allow re-selecting the same files if needed
        } else {
            console.error('Preview container not found');
        }
    }

    function checkPhotoCount() {
        const photoCount = allSelectedPhotos.length;
        const submitButton = document.getElementById('submit-button');
        submitButton.disabled = photoCount === 0;
        if (photoCount === 0) {
            document.getElementById('error-message').innerText = '';
        } else {
            document.getElementById('error-message').innerText = '';
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

                    const orderList = document.querySelector(`#order-${orderIndex} .photo-list`);
                    if (orderList.children.length === 0) {
                        const orderElement = document.getElementById(`order-${orderIndex}`);
                        if (orderElement) {
                            orderElement.parentNode.removeChild(orderElement);
                        }

                        // Update data-order-index for remaining orders
                        document.querySelectorAll('.order-list > li').forEach((orderElement, newIndex) => {
                            orderElement.id = `order-${newIndex}`;
                            orderElement.querySelectorAll('.remove-photo').forEach(button => {
                                button.setAttribute('data-order-index', newIndex);
                            });
                        });

                        if (document.querySelectorAll('.order-list .photo-list').length === 0) {
                            // Redirect to order form page if no orders left
                            window.location.href = '/';
                        }
                    } else {
                        // Update data-photo-index for remaining photos
                        orderList.querySelectorAll('.photo-item').forEach((item, newIndex) => {
                            item.setAttribute('data-photo-index', newIndex);
                            item.querySelector('.remove-photo').setAttribute('data-photo-index', newIndex);
                        });
                    }
                } else {
                    console.error(`Photo item not found for order ${orderIndex} and photo ${photoIndex}`);
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
                window.location.href = '/'; // Redirect to the order form page
            } else {
                console.error(`Error from server: ${data.error}`);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }

    // Function to handle "Place Another Order" button click
    function clearAllAndRedirect() {
        console.log("clearAllAndRedirect function called");
        fetch("/clear_all", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log("Response from clear_all:", data);
            if (data.success) {
                window.location.href = '/'; // Redirect to the order form page
            } else {
                console.error(`Error from server: ${data.error}`);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }

    attachEventListeners(); // Initial attachment of event listeners
    if (document.querySelector('.preview')) {
        updatePreview();
    }

    // Attach event listener for "Place Another Order" button
    document.getElementById('place-another-order').addEventListener('click', function () {
        console.log("Place Another Order button clicked");
        clearAllAndRedirect();
    });
});