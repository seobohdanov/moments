from flask import Flask, render_template, request, redirect, url_for, send_from_directory, session, jsonify
import os
import uuid
import zipfile
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler
import httpx
from threading import Timer

app = Flask(__name__)
app.secret_key = os.urandom(24)  # Секретный ключ для сессий

app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['ALLOWED_EXTENSIONS'] = {'png', 'jpg', 'jpeg', 'gif', 'heic', 'webp'}
app.config['ARCHIVE_FOLDER'] = 'archives'
app.config['SERVER_ADDRESS'] = 'http://ec2-13-60-99-164.eu-north-1.compute.amazonaws.com:5000'

if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'])
if not os.path.exists(app.config['ARCHIVE_FOLDER']):
    os.makedirs(app.config['ARCHIVE_FOLDER'])
if not os.path.exists('logs'):
    os.makedirs('logs')

# Настройка логирования
file_handler = RotatingFileHandler('logs/app.log', maxBytes=10240, backupCount=10)
file_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'))
file_handler.setLevel(logging.DEBUG)

app.logger.addHandler(file_handler)
app.logger.setLevel(logging.DEBUG)
app.logger.info('App startup')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

@app.context_processor
def utility_processor():
    def enumerate_func(iterable):
        return enumerate(iterable)
    return dict(enumerate=enumerate_func)

def clear_session():
    session.pop('order_submitted', None)
    session.pop('user_info', None)
    session.pop('orders', None)  # Очистка текущих заказов

def delayed_clear_session(delay):
    Timer(delay, clear_session).start()

@app.route('/')
def index():
    try:
        if 'user_id' not in session:
            session['user_id'] = str(uuid.uuid4())  # Генерация уникального идентификатора для сессии
        orders = session.get('orders', [])
        total_photos = sum(len(order['photos']) for order in orders)
        return render_template('index.html', orders=orders, total_photos=total_photos)
    except Exception as e:
        app.logger.error(f"Error in index route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/load_content')
def load_content():
    try:
        page = request.args.get('page')
        orders = session.get('orders', [])
        user_info = session.get('user_info', {})
        total_photos = sum(len(order['photos']) for order in orders)

        if page == 'order_summary':
            return render_template('order_summary.html', orders=orders)
        elif page == 'complete_order_form':
            return render_template('complete_order_form.html', orders=orders, total_photos=total_photos)
        elif page == 'confirmation':
            archive_name = request.args.get('archive_name')
            return render_template('confirmation.html', archive_name=archive_name, user_info=user_info, orders=orders, total_photos=total_photos)
        else:
            return render_template('index.html', orders=orders, total_photos=total_photos)
    except Exception as e:
        app.logger.error(f"Error in load_content route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/add_order', methods=['POST'])
def add_order():
    try:
        if 'orders' not in session:
            session['orders'] = []

        size = request.form['size']
        paper_type = request.form.get('paper_type', 'glossy')
        photos = request.files.getlist('photos')
        if not photos:
            return jsonify(success=False, error='No photos selected')

        photo_filenames = []
        for photo in photos:
            if photo and allowed_file(photo.filename):
                filename = str(uuid.uuid4()) + '_' + photo.filename  # Генерация уникального имени файла
                photo.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                photo_filenames.append(filename)
        
        order = {
            'size': size,
            'paper_type': paper_type,
            'photos': photo_filenames
        }
        session['orders'].append(order)
        session.modified = True

        return jsonify(success=True, next_url=url_for('load_content', page='order_summary'))
    except Exception as e:
        app.logger.error(f"Error in add_order route: {e}")
        return jsonify(success=False, error=str(e))

@app.route('/order_summary')
def order_summary():
    try:
        orders = session.get('orders', [])
        return render_template('order_summary.html', orders=orders)
    except Exception as e:
        app.logger.error(f"Error in order_summary route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/complete_order_form')
def complete_order_form():
    try:
        if 'order_submitted' in session:
            return redirect(url_for('index'))
        orders = session.get('orders', [])
        total_photos = sum(len(order['photos']) for order in orders)
        return render_template('complete_order_form.html', orders=orders, total_photos=total_photos)
    except Exception as e:
        app.logger.error(f"Error in complete_order_form route: {e}")
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
        session['order_submitted'] = True
        session.modified = True

        archive_name = create_order_archive(user_info, session['orders'])
        send_order_to_telegram(user_info, archive_name)

        delayed_clear_session(5)  # Очистка сессии через 5 секунд

        return jsonify(success=True, next_url=url_for('load_content', page='confirmation', archive_name=archive_name))
    except Exception as e:
        app.logger.error(f"Error in complete_order route: {e}")
        return jsonify(success=False, error=str(e))

@app.route('/confirmation')
def confirmation():
    try:
        archive_name = request.args.get('archive_name')
        user_info = session.get('user_info', {})
        orders = session.get('orders', [])
        total_photos = sum(len(order['photos']) for order in orders)
        return render_template('confirmation.html', user_info=user_info, archive_name=archive_name, orders=orders, total_photos=total_photos)
    except Exception as e:
        app.logger.error(f"Error in confirmation route: {e}")
        return "An error occurred. Check logs for details.", 500

def create_order_archive(user_info, orders):
    try:
        base_timestamp = datetime.now().strftime('%d%m%Y')
        order_count = get_next_order_count(base_timestamp)
        archive_name = f"{base_timestamp}_{order_count}_{user_info['last_name']}.zip"
        archive_path = os.path.join(app.config['ARCHIVE_FOLDER'], archive_name)

        with zipfile.ZipFile(archive_path, 'w') as archive:
            for order in orders:
                material = 'm' if order['paper_type'] == 'matte' else 'g'
                folder_name = f"{order['size']}_{len(order['photos'])}_{material}"
                for photo in order['photos']:
                    photo_path = os.path.join(app.config['UPLOAD_FOLDER'], photo)
                    archive.write(photo_path, os.path.join(folder_name, photo))
        return archive_name
    except Exception as e:
        app.logger.error(f"Error in create_order_archive function: {e}")
        raise

def get_next_order_count(base_timestamp):
    archives = os.listdir(app.config['ARCHIVE_FOLDER'])
    same_day_archives = [name for name in archives if name.startswith(base_timestamp)]
    return len(same_day_archives) + 1

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
        app.logger.error(f"Failed to send message to Telegram: {e}")

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    try:
        return send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    except Exception as e:
        app.logger.error(f"Error in uploaded_file route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/archives/<filename>')
def download_archive(filename):
    try:
        return send_from_directory(app.config['ARCHIVE_FOLDER'], filename)
    except Exception as e:
        app.logger.error(f"Error in download_archive route: {e}")
        return "An error occurred. Check logs for details.", 500

@app.route('/remove_photo', methods=['POST'])
def remove_photo():
    try:
        order_index = int(request.form['order_index'])
        photo_index = int(request.form['photo_index'])

        if 0 <= order_index < len(session['orders']):
            if 0 <= photo_index < len(session['orders'][order_index]['photos']):
                session['orders'][order_index]['photos'].pop(photo_index)
                if len(session['orders'][order_index]['photos']) == 0:
                    session['orders'].pop(order_index)
                session.modified = True
                if len(session['orders']) == 0:
                    return jsonify(success=True, redirect_url=url_for('index'))
                return jsonify(success=True)
        return jsonify(success=False, error='Invalid index')
    except Exception as e:
        app.logger.error(f"Error in remove_photo route: {e}")
        return jsonify(success=False, error='An error occurred. Check logs for details.')

@app.route('/clear_all', methods=['POST'])
def clear_all():
    session.clear()
    response = {
        'success': True,
        'redirect_url': url_for('index')  # Assuming 'index' is the endpoint for the order form page
    }
    return jsonify(response)

if __name__ == '__main__':
    logging.basicConfig(level=logging.DEBUG)
    app.run(host='0.0.0.0', port=5000, debug=True)