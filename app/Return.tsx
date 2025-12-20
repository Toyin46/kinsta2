import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Return() {
  const [countdown, setCountdown] = useState(3);
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');

    if (!sessionId) {
      navigate('/buy-coins');
      return;
    }

    // Countdown and redirect to wallet
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/wallet');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-green-600 mb-2">Payment Successful!</h2>
        <p className="text-gray-600 mb-6">
          Your coins have been added to your account.
        </p>
        <p className="text-sm text-gray-500">
          Redirecting to your wallet in {countdown} seconds...
        </p>
        <button
          onClick={() => navigate('/wallet')}
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition"
        >
          Go to Wallet Now
        </button>
      </div>
    </div>
  );
}
	
