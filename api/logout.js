module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', 'buyer_checkout_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return res.status(200).json({ ok: true });
};
