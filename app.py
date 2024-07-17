from flask import Flask, render_template, request, redirect, url_for, send_from_directory, session, jsonify
import os
import uuid
import zipfile
from datetime import datetime
import logging
import httpx

app = Flask(__name__)
app.secret_key = 'supersecretkey'  # Секретный ключ для сессий
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp'}
app.config['ARCHIVE_FOLDER'] = 'archives'
app.config['SERVER_ADDRESS'] = 'http://ec2-13-60-99-164.eu-north-1.compute.amazonaws.com:5000'

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])
if not os.path.exists(app.config['ARCHIVE_FOLDER']):
    os.makedirs(app.config['ARCHIVE_FOLDER'])

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.context_processor
def utility_processor():
    def enumerate_func(iterable):
        return enumerate(iterable)
    return dict(enumerate=enumerate_func)

@app.route('/')
def index():
    try:
        if 'user_id' not in session:
            session['user_id'] = str(uuid.uuid4())  # Генерация уникального идентификатора для сессии
        orders = session.get('orders', [])
        total_photos = sum(len(order['photos']) for order in orders)
        return render_template('index.html', orders=orders, total_photos=total_photos)
    except Exception as e:
        logging.error(f"Error in index route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/add_order', methods=['POST'])
def add_order():
    try:
        if 'orders' not in session:
            session['orders'] = []

        size = request.form['size']
        paper_type = request.form.get('paper_type', 'glossy')
        photos = request.files.getlist('photos')
        photo_filenames = []
        for photo in photos:
            if photo and allowed_file(photo.filename):
                filename = photo.filename
                photo.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                photo_filenames.append(filename)
        
        order = {
            'size': size,
            'paper_type': paper_type,
            'photos': photo_filenames
        }
        session['orders'].append(order)
        session.modified = True

        return redirect(url_for('order_summary'))
    except Exception as e:
        logging.error(f"Error in add_order route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/order_summary')
def order_summary():
    try:
        orders = session.get('orders', [])
        return render_template('order_summary.html', orders=orders)
    except Exception as e:
        logging.error(f"Error in order_summary route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/complete_order_form')
def complete_order_form():
    try:
        orders = session.get('orders', [])
        return render_template('complete_order_form.html', orders=orders)
    except Exception as e:
        logging.error(f"Error in complete_order_form route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/complete_order', methods=['POST'])
def complete_order():
    try:
        user_info = {
            'first_name': request.form['first_name'],
            'last_name': request.form['last_name'],
            'phone': request.form['phone'],
            'city': request.form['city'],
            'post_office': request.form['post_office']
        }
        session['user_info'] = user_info
        session.modified = True

        archive_name = create_order_archive(user_info, session['orders'])
        send_order_to_telegram(user_info, archive_name)
        
        return redirect(url_for('confirmation', archive_name=archive_name))
    except Exception as e:
        logging.error(f"Error in complete_order route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/confirmation')
def confirmation():
    try:
        archive_name = request.args.get('archive_name')
        user_info = session.get('user_info', {})
        orders = session.get('orders', [])
        total_photos = sum(len(order['photos']) for order in orders)
        return render_template('confirmation.html', user_info=user_info, archive_name=archive_name, orders=orders, total_photos=total_photos)
    except Exception as e:
        logging.error(f"Error in confirmation route: {e}")
        return "An error occurred. Check logs for details.", 500

def create_order_archive(user_info, orders):
    try:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        archive_name = f"order_{user_info['last_name']}_{user_info['first_name']}_{timestamp}.zip"
        archive_path = os.path.join(app.config['ARCHIVE_FOLDER'], archive_name)
        with zipfile.ZipFile(archive_path, 'w') as archive:
            for order_index, order in enumerate(orders):
                folder_name = f"{order_index + 1}_{order['size']}_{order['paper_type']}".replace(' ', '_')
                for photo in order['photos']:
                    photo_path = os.path.join(app.config['UPLOAD_FOLDER'], photo)
                    archive.write(photo_path, os.path.join(folder_name, photo))
        return archive_name
    except Exception as e:
        logging.error(f"Error in create_order_archive function: {e}")
        raise

def send_order_to_telegram(user_info, archive_name):
    try:
        bot_token = '7410874657:AAHibMVweWuCPsDlghx64W6gKMHWoz7yTiM'
        chat_id = '-1002243134010'
        message = (
            f"New Order:\n"
            f"    Name: {user_info['first_name']} {user_info['last_name']}\n"
            f"    Phone: {user_info['phone']}\n"
            f"    City: {user_info['city']}\n"
            f"    Post Office: {user_info['post_office']}\n"
            f"    Archive: {app.config['SERVER_ADDRESS']}/archives/{archive_name}"
        )
        bot = httpx.Client()
        bot.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", json={
            'chat_id': chat_id,
            'text': message,
            'disable_web_page_preview': True
        })
    except Exception as e:
        logging.error(f"Failed to send message to Telegram: {e}")

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        logging.error(f"Error in uploaded_file route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/archives/<filename>')
def download_archive(filename):
    try:
        return send_from_directory(app.config['ARCHIVE_FOLDER'], filename)
    except Exception as e:
        logging.error(f"Error in download_archive route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/remove_photo', methods=['POST'])
def remove_photo():
    try:
        order_index = int(request.form['order_index'])
        photo_index = int(request.form['photo_index'])
        
        if 0 <= order_index < len(session['orders']):
            if 0 <= photo_index < len(session['orders'][order_index]['photos']):
                session['orders'][order_index]['photos'].pop(photo_index)
                session.modified = True
                return jsonify({'success': True, 'order': session['orders'][order_index]})
        return jsonify({'success': False, 'error': 'Invalid index'})
    except Exception as e:
        logging.error(f"Error in remove_photo route: {e}")
        return jsonify({'success': False, 'error': 'An error occurred. Check logs for details.'})

@app.route('/clear_all', methods=['POST'])
def clear_all():
    try:
        session.pop('orders', None)
        session.modified = True
        return jsonify({'success': True, 'redirect': url_for('index')})
    except Exception as e:
        logging.error(f"Error in clear_all route: {e}")
        return jsonify({'success': False, 'error': 'An error occurred. Check logs for details.'})

if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG)
    app.run(host='0.0.0.0', port=5000, debug=True)
