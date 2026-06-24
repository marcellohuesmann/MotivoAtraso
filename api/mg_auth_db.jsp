<%@ page import="java.sql.*, java.io.*, java.util.Properties, java.security.MessageDigest" %>
<%!
    // Carrega host/porta/usuário/senha do MESMO servidor MySQL já configurado em config.html
    // (WEB-INF/db_config.properties). O nome do banco em si é ignorado aqui: a autenticação do
    // Multi Gerenciador sempre usa o banco "multitone_mg", separado da base da plataforma Multitone.
    private Properties loadMgAuthProps(ServletContext context) throws Exception {
        Properties props = new Properties();
        String path = context.getRealPath("/WEB-INF/db_config.properties");
        File file = new File(path);
        if (file.exists()) {
            InputStream in = null;
            try {
                in = new FileInputStream(file);
                props.load(in);
            } finally {
                if (in != null) { try { in.close(); } catch (Exception e) {} }
            }
        } else {
            props.setProperty("db.host", "localhost");
            props.setProperty("db.port", "3306");
            props.setProperty("db.user", "root");
            props.setProperty("db.pass", "1@multitone");
        }
        return props;
    }

    public String sha256Hex(String base) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(base.getBytes("UTF-8"));
        StringBuilder hex = new StringBuilder();
        for (byte b : hash) {
            String h = Integer.toHexString(0xff & b);
            if (h.length() == 1) hex.append('0');
            hex.append(h);
        }
        return hex.toString();
    }

    // Conexão pronta para uso, já apontando para o banco multitone_mg.
    public Connection getMgConnection(ServletContext context) throws Exception {
        Properties props = loadMgAuthProps(context);
        Class.forName("com.mysql.jdbc.Driver");
        return DriverManager.getConnection(
            "jdbc:mysql://" + props.getProperty("db.host") + ":" + props.getProperty("db.port") + "/multitone_mg" +
            "?useSSL=false&allowPublicKeyRetrieval=true&useUnicode=true&characterEncoding=UTF-8",
            props.getProperty("db.user"), props.getProperty("db.pass")
        );
    }

    // Idempotente: cria o banco multitone_mg, a tabela mg_users e o usuário admin/admin
    // (com troca de senha obrigatória) caso ainda não existam. Seguro de chamar em toda tentativa de login.
    public void ensureMgDatabase(ServletContext context) throws Exception {
        Properties props = loadMgAuthProps(context);
        Class.forName("com.mysql.jdbc.Driver");
        Connection conn = DriverManager.getConnection(
            "jdbc:mysql://" + props.getProperty("db.host") + ":" + props.getProperty("db.port") + "/" +
            "?useSSL=false&allowPublicKeyRetrieval=true",
            props.getProperty("db.user"), props.getProperty("db.pass")
        );
        try {
            Statement st = conn.createStatement();
            st.execute("CREATE DATABASE IF NOT EXISTS multitone_mg DEFAULT CHARACTER SET utf8mb4");
            st.execute("USE multitone_mg");
            st.execute(
                "CREATE TABLE IF NOT EXISTS mg_users (" +
                "id_mg_user INT AUTO_INCREMENT PRIMARY KEY," +
                "login VARCHAR(50) NOT NULL UNIQUE," +
                "nome VARCHAR(100) NOT NULL DEFAULT ''," +
                "password_hash VARCHAR(64) NOT NULL," +
                "must_change_password TINYINT(1) NOT NULL DEFAULT 0," +
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP" +
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            );

            // Migração para bancos criados antes da coluna "nome" existir.
            ResultSet rsCol = st.executeQuery(
                "SELECT COUNT(*) AS total FROM information_schema.columns " +
                "WHERE table_schema = 'multitone_mg' AND table_name = 'mg_users' AND column_name = 'nome'");
            rsCol.next();
            boolean hasNomeColumn = rsCol.getInt("total") > 0;
            rsCol.close();
            if (!hasNomeColumn) {
                st.execute("ALTER TABLE mg_users ADD COLUMN nome VARCHAR(100) NOT NULL DEFAULT '' AFTER login");
            }

            ResultSet rs = st.executeQuery("SELECT COUNT(*) AS total FROM mg_users");
            rs.next();
            int total = rs.getInt("total");
            rs.close();

            if (total == 0) {
                PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO mg_users (login, nome, password_hash, must_change_password) VALUES (?, ?, ?, 1)");
                ps.setString(1, "admin");
                ps.setString(2, "Administrador");
                ps.setString(3, sha256Hex("admin"));
                ps.executeUpdate();
                ps.close();
            }
            st.close();
        } finally {
            try { conn.close(); } catch (Exception e) {}
        }
    }
%>
