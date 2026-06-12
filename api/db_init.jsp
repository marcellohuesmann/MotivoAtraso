<%@ page import="java.sql.*, java.io.*, java.util.Properties" %>
<%!
    private Properties loadProperties(ServletContext context) throws Exception {
        Properties props = new Properties();
        String path = context.getRealPath("/WEB-INF/db_config.properties");
        File file = new File(path);
        if (!file.exists()) {
            file.getParentFile().mkdirs();
            props.setProperty("db.host", "localhost");
            props.setProperty("db.port", "3306");
            props.setProperty("db.user", "root");
            props.setProperty("db.pass", "1@multitone");
            props.setProperty("db.name", "multitone_server");
            OutputStream out = null;
            try {
                out = new FileOutputStream(file);
                props.store(out, "Database Connection Settings");
            } finally {
                if (out != null) {
                    try { out.close(); } catch (Exception e) {}
                }
            }
        } else {
            InputStream in = null;
            try {
                in = new FileInputStream(file);
                props.load(in);
            } finally {
                if (in != null) {
                    try { in.close(); } catch (Exception e) {}
                }
            }
        }
        return props;
    }

    public Connection getConnection(ServletContext context) throws Exception {
        Properties props = loadProperties(context);
        Class.forName("com.mysql.jdbc.Driver");
        return DriverManager.getConnection(
            "jdbc:mysql://" + props.getProperty("db.host") + ":" + props.getProperty("db.port") + "/" + props.getProperty("db.name") +
            "?useSSL=false&allowPublicKeyRetrieval=true&useUnicode=true&characterEncoding=UTF-8",
            props.getProperty("db.user"), props.getProperty("db.pass")
        );
    }
%>
